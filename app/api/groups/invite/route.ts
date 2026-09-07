import { NextResponse } from 'next/server';
import { sendGroupInviteEmail } from '../../../../lib/email/groupInviteEmail';
import { hasEmailConfig } from '../../../../lib/email/sendEmail';
import { canManageGroup, roleLabel } from '../../../../lib/groups';
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

async function requireTeamManager(supabase: ReturnType<typeof createSupabaseFromRequest>['supabase'], userId: string, teamId: string) {
  const { data: membership, error } = await supabase
    .from('st_team_members')
    .select('role, display_name, status')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { error: error.message, membership: null as any };
  if (!membership || membership.status !== 'active' || !canManageGroup(membership.role)) {
    return { error: 'Only owners and editors can invite members.', membership: null as any };
  }
  return { error: null, membership };
}

/** POST — create/update pending invites and email them. */
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
  if (manageError) return NextResponse.json({ error: manageError }, { status: 403 });

  const { data: team, error: teamError } = await supabase
    .from('st_teams')
    .select('id, name, invite_code')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError || !team) {
    return NextResponse.json({ error: teamError?.message || 'Group not found' }, { status: 404 });
  }

  const inviterName = membership?.display_name || user.email || 'A BuildIQ Health coach';
  const appUrl = String(body?.appUrl || process.env.NEXT_PUBLIC_APP_URL || '').trim() || undefined;

  const results: Array<{
    email: string;
    ok: boolean;
    emailed: boolean;
    inviteId?: string;
    error?: string;
  }> = [];

  for (const invite of invites) {
    const email = normalizeInviteEmail(invite.email);
    if (!isValidInviteEmail(email)) {
      results.push({ email, ok: false, emailed: false, error: 'Invalid email' });
      continue;
    }

    const row = {
      team_id: teamId,
      email,
      display_name: invite.displayName || null,
      role: invite.role,
      invited_by: user.id,
      status: 'pending',
      last_sent_at: new Date().toISOString(),
    };

    const { data: upserted, error: upsertError } = await supabase
      .from('st_group_invites')
      .upsert(row, { onConflict: 'team_id,email' })
      .select('id, email')
      .maybeSingle();

    if (upsertError) {
      const missingTable = /st_group_invites|schema cache|does not exist/i.test(upsertError.message || '');
      results.push({
        email,
        ok: false,
        emailed: false,
        error: missingTable
          ? 'Invite table is not set up yet. Run migration 20250904_044_group_member_invites.sql in Supabase.'
          : upsertError.message,
      });
      continue;
    }

    const emailResult = await sendGroupInviteEmail({
      to: email,
      groupName: team.name,
      inviteCode: team.invite_code,
      inviterName,
      inviteeName: invite.displayName || null,
      roleLabel: roleLabel(invite.role),
      appUrl,
    });

    results.push({
      email,
      ok: emailResult.ok,
      emailed: !!emailResult.emailed,
      inviteId: upserted?.id,
      error: emailResult.error,
    });
  }

  const sent = results.filter((r) => r.ok && r.emailed).length;
  const saved = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: failed === 0,
    emailConfigured: hasEmailConfig(),
    inviteCode: team.invite_code,
    groupName: team.name,
    sent,
    saved,
    failed,
    results,
  });
}

/** GET — list pending invites for a team. */
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
    .select('id, team_id, email, display_name, role, status, last_sent_at, accepted_at, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) {
    const missingTable = /st_group_invites|schema cache|does not exist/i.test(error.message || '');
    return NextResponse.json(
      {
        invites: [],
        error: missingTable
          ? 'Invite table is not set up yet. Run migration 20250904_044_group_member_invites.sql in Supabase.'
          : error.message,
      },
      { status: missingTable ? 200 : 500 }
    );
  }

  return NextResponse.json({ invites: data || [], emailConfigured: hasEmailConfig() });
}
