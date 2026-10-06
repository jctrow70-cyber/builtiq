import { NextResponse } from 'next/server';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

/** POST — cancel a pending invitation. The row is kept and the token stops working. */
export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (authError || !user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  let body: { inviteId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const inviteId = String(body?.inviteId || '').trim();
  if (!inviteId) return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });

  const { error } = await supabase.rpc('st_revoke_group_invite', { p_invite_id: inviteId });
  if (error) {
    const hint = /st_revoke_group_invite|schema cache|could not find the function/i.test(error.message || '')
      ? 'Run migration 20261005_056_secure_group_invitations.sql in Supabase first.'
      : error.message;
    return NextResponse.json({ error: hint }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: 'revoked' });
}
