import { NextResponse } from 'next/server';
import { sendGroupInviteEmail } from '../../../../lib/email/groupInviteEmail';
import { hasEmailConfig } from '../../../../lib/email/sendEmail';
import { canManageGroup, roleLabel } from '../../../../lib/groups';
import { canInviteGroupRole, deriveInviteStatus, recordGroupInvitationEvent } from '../../../../lib/groups/invitationSecurity';
import {
  isValidInviteEmail,
  normalizeInviteDrafts,
  normalizeInviteEmail,
  type GroupInviteDraft,
} from '../../../../lib/groups/invites';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

type InviteBody = {
  teamId?: string;
  invites?: GroupInviteDraft[];
  appUrl?: string;
};

const INVITE_COLUMNS =
  'id, team_id, email, display_name, role, status, classification_ids, expires_at, accepted_at, accepted_by_user_id, last_sent_at, created_at, updated_at';

async function requireTeamManager(supabase: ReturnType<typeof createSupabaseFromRequest>['supabase'], userId: string, teamId: string) {
  const { data: membership, error } = await supabase
    .from('st_team_members')
    .select('role, display_name, status')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { error: error.message, membership: null as null };
  if (!membership || membership.status !== 'active' || !canManageGroup(membership.role)) {
    return { error: 'Only owners and managers can invite members.', membership: null as null };
  }
  return { error: null, membership };
}

function migrationHint(message: string): string | null {
  if (/st_create_group_invite|st_group_quick_join|schema cache|does not exist|could not find the function/i.test(message)) {
    return 'Run migration 20261005_056_secure_group_invitations.sql in Supabase first.';
  }
  return null;
}

function appOrigin(request: Request, bodyUrl?: string): string {
  const fromBody = String(bodyUrl || '').trim().replace(/\/$/, '');
  if (fromBody) return fromBody;
  const envUrl = String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (envUrl) return envUrl;
  const host = request.headers.get('origin') || '';
  return host.replace(/\/$/, '');
}

/** POST — create a secure invitation and email a one-time link. */
export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (authError || !user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  let body: InviteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const teamId = String(body?.teamId || '').trim();
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const invites = normalizeInviteDrafts(Array.isArray(body?.invites) ? body.invites : []);
  if (!invites.length) {
    return NextResponse.json({ error: 'Add at least one valid email to invite.' }, { status: 400 });
  }

  const { error: manageError, membership } = await requireTeamManager(supabase, user.id, teamId);
  if (manageError || !membership) return NextResponse.json({ error: manageError || 'Not allowed' }, { status: 403 });

  const { data: team, error: teamError } = await supabase
    .from('st_teams')
    .select('id, name, managers_can_invite_managers, is_archived')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError || !team) {
    return NextResponse.json({ error: teamError?.message || 'Group not found' }, { status: 404 });
  }

  const inviterName = membership.display_name || 'A group member';
  const origin = appOrigin(request, body?.appUrl);
  const results: Array<{
    email: string;
    ok: boolean;
    created: boolean;
    emailed: boolean;
    inviteId?: string;
    error?: string;
  }> = [];

  for (const invite of invites) {
    const email = normalizeInviteEmail(invite.email);
    if (!isValidInviteEmail(email)) {
      results.push({ email, ok: false, created: false, emailed: false, error: 'Invalid email' });
      continue;
    }
    if (
      !canInviteGroupRole({
        callerRole: membership.role,
        targetRole: invite.role,
        managersCanInviteManagers: !!team.managers_can_invite_managers,
      })
    ) {
      results.push({ email, ok: false, created: false, emailed: false, error: 'You cannot invite that role.' });
      continue;
    }

    const classificationIds =
      invite.classificationId && /^[0-9a-f-]{36}$/i.test(invite.classificationId) ? [invite.classificationId] : [];
    const { data: created, error: createError } = await supabase.rpc('st_create_group_invite', {
      p_team_id: teamId,
      p_email: email,
      p_display_name: invite.displayName || null,
      p_role: invite.role,
      p_classification_ids: classificationIds,
    });

    if (createError || !created?.token || !created?.id) {
      const message = createError?.message || 'Could not create the invitation';
      results.push({
        email,
        ok: false,
        created: false,
        emailed: false,
        error: migrationHint(message) || message,
      });
      continue;
    }

    recordGroupInvitationEvent({ type: 'group_invitation', inviteId: created.id, teamId });
    const joinUrl = `${origin}/invite/${created.token}`;
    const emailResult = await sendGroupInviteEmail({
      to: email,
      groupName: team.name,
      inviterName,
      inviteeName: invite.displayName || null,
      roleLabel: roleLabel(invite.role),
      joinUrl,
      expiresAt: created.expires_at,
    });

    results.push({
      email,
      ok: true,
      created: true,
      emailed: !!emailResult.emailed,
      inviteId: created.id,
      error: emailResult.emailed ? undefined : emailResult.error || 'Invitation saved, but the email was not sent.',
    });
  }

  const emailed = results.filter((r) => r.created && r.emailed).length;
  const created = results.filter((r) => r.created).length;
  const failed = results.filter((r) => !r.created).length;

  return NextResponse.json({
    ok: failed === 0,
    emailConfigured: hasEmailConfig(),
    groupName: team.name,
    emailed,
    created,
    failed,
    results: results.map(({ email, ok, created: wasCreated, emailed: wasEmailed, inviteId, error }) => ({
      email,
      ok,
      created: wasCreated,
      emailed: wasEmailed,
      inviteId,
      error,
    })),
  });
}

/** GET — invitations for managers. Token hashes are not selected. */
export async function GET(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (authError || !user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const teamId = String(url.searchParams.get('teamId') || '').trim();
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const { error: manageError } = await requireTeamManager(supabase, user.id, teamId);
  if (manageError) return NextResponse.json({ error: manageError }, { status: 403 });

  const { data, error } = await supabase
    .from('st_group_invites')
    .select(INVITE_COLUMNS)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) {
    const hint = migrationHint(error.message);
    const missingTable = /st_group_invites|schema cache|does not exist/i.test(error.message || '');
    return NextResponse.json(
      {
        invites: [],
        error: hint || (missingTable ? 'Run migration 20261005_056_secure_group_invitations.sql in Supabase first.' : error.message),
      },
      { status: missingTable ? 200 : 500 }
    );
  }

  const invites = (data || []).map((row) => ({
    ...row,
    display_status: deriveInviteStatus(row.status, row.expires_at),
  }));

  return NextResponse.json({ invites, emailConfigured: hasEmailConfig() });
}
