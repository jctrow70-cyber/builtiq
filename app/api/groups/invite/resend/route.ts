import { NextResponse } from 'next/server';
import { sendGroupInviteEmail } from '../../../../../lib/email/groupInviteEmail';
import { roleLabel } from '../../../../../lib/groups';
import { recordGroupInvitationEvent } from '../../../../../lib/groups/invitationSecurity';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

function migrationHint(message: string): string | null {
  if (/st_resend_group_invite|schema cache|does not exist|could not find the function/i.test(message)) {
    return 'Run migration 20261005_056_secure_group_invitations.sql in Supabase first.';
  }
  return null;
}

/** POST — replace the invitation token and email the new link. */
export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (authError || !user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  let body: { inviteId?: string; appUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const inviteId = String(body?.inviteId || '').trim();
  if (!inviteId) return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });

  const { data: refreshed, error } = await supabase.rpc('st_resend_group_invite', { p_invite_id: inviteId });
  if (error || !refreshed?.token || !refreshed?.team_id) {
    const message = error?.message || 'Could not resend the invitation';
    return NextResponse.json({ error: migrationHint(message) || message }, { status: 400 });
  }

  const { data: team } = await supabase.from('st_teams').select('name').eq('id', refreshed.team_id).maybeSingle();
  const { data: membership } = await supabase
    .from('st_team_members')
    .select('display_name')
    .eq('team_id', refreshed.team_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const origin = String(body?.appUrl || process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || '')
    .trim()
    .replace(/\/$/, '');
  recordGroupInvitationEvent({ type: 'group_invitation', inviteId, teamId: refreshed.team_id });

  const emailResult = await sendGroupInviteEmail({
    to: refreshed.email,
    groupName: team?.name || 'your group',
    inviterName: membership?.display_name || 'A group member',
    roleLabel: roleLabel(refreshed.role),
    joinUrl: `${origin}/invite/${refreshed.token}`,
    expiresAt: refreshed.expires_at,
  });

  return NextResponse.json({
    ok: true,
    created: true,
    emailed: !!emailResult.emailed,
    error: emailResult.emailed ? undefined : emailResult.error || 'A new link was created, but the email was not sent.',
  });
}
