import { NextResponse } from 'next/server';
import { isAppAdmin } from '../../../../lib/appAdmin';
import { hasEmailConfig } from '../../../../lib/email/sendEmail';
import { createSupabaseFromRequest, createServiceRoleSupabase, requireAuthUser } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

const BUG_STATUSES = ['open', 'triaged', 'resolved', 'closed'] as const;
type BugStatus = (typeof BUG_STATUSES)[number];

function isBugStatus(value: string): value is BugStatus {
  return (BUG_STATUSES as readonly string[]).includes(value);
}

async function reporterEmailsByUserId(admin: ReturnType<typeof createServiceRoleSupabase>, userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const emailByUserId: Record<string, string | null> = {};

  await Promise.all(
    uniqueIds.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      emailByUserId[userId] = error || !data?.user ? null : data.user.email || null;
    })
  );

  return emailByUserId;
}

/** GET — list all bug reports (platform admins only). */
export async function GET(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });

  const isAdmin = isAppAdmin(user);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Only BuildIQ Health admins can view bug reports.' }, { status: 403 });
  }

  let admin;
  try {
    admin = createServiceRoleSupabase();
  } catch (e: any) {
    return NextResponse.json(
      {
        isAdmin: true,
        emailConfigured: hasEmailConfig(),
        reports: [],
        error: e?.message || 'Server missing SUPABASE_SERVICE_ROLE_KEY',
      },
      { status: 503 }
    );
  }

  const { data, error } = await admin
    .from('st_bug_reports')
    .select('id, user_id, title, description, page_context, app_nav, user_agent, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reports = data || [];
  const emailByUserId = await reporterEmailsByUserId(
    admin,
    reports.map((row) => row.user_id)
  );

  return NextResponse.json({
    isAdmin: true,
    emailConfigured: hasEmailConfig(),
    reports: reports.map((row) => ({
      ...row,
      reporter_email: emailByUserId[row.user_id] || null,
    })),
  });
}

/** PATCH — update bug report status (platform admins only). */
export async function PATCH(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });

  if (!isAppAdmin(user)) {
    return NextResponse.json({ error: 'Only BuildIQ Health admins can update bug reports.' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = String(body?.id || '').trim();
  const status = String(body?.status || '').trim().toLowerCase();
  if (!id) return NextResponse.json({ error: 'Report id is required' }, { status: 400 });
  if (!isBugStatus(status)) {
    return NextResponse.json({ error: `Status must be one of: ${BUG_STATUSES.join(', ')}` }, { status: 400 });
  }

  let admin;
  try {
    admin = createServiceRoleSupabase();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  }

  const { data, error } = await admin
    .from('st_bug_reports')
    .update({ status })
    .eq('id', id)
    .select('id, status, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, report: data });
}
