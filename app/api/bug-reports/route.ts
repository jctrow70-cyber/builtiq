import { NextResponse } from 'next/server';
import { notifyBugReport } from '../../../lib/email/bugReportNotification';
import { createSupabaseFromRequest, requireAuthUser } from '../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (authError || !user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const description = String(body?.description || '').trim();
  if (description.length < 8) {
    return NextResponse.json({ error: 'Please describe the issue (at least 8 characters)' }, { status: 400 });
  }
  if (description.length > 8000) {
    return NextResponse.json({ error: 'Description is too long (max 8000 characters)' }, { status: 400 });
  }

  const title = String(body?.title || '').trim().slice(0, 200);
  const pageContext = String(body?.pageContext || '').trim().slice(0, 2000);
  const appNav = String(body?.appNav || '').trim().slice(0, 80);
  const userAgent = String(body?.userAgent || request.headers.get('user-agent') || '').slice(0, 500);

  const { data, error } = await supabase
    .from('st_bug_reports')
    .insert({
      user_id: user.id,
      title: title || null,
      description,
      page_context: pageContext || null,
      app_nav: appNav || null,
      user_agent: userAgent || null,
      status: 'open',
    })
    .select('id, created_at')
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: error.message.includes('st_bug_reports')
          ? 'Bug reports table is not set up yet. Run migration 20250711_015_coaching_notes_and_bug_reports.sql in Supabase.'
          : error.message,
      },
      { status: 500 }
    );
  }

  notifyBugReport({
    reportId: data.id,
    title: title || null,
    description,
    pageContext: pageContext || null,
    appNav: appNav || null,
    userAgent: userAgent || null,
    reporterEmail: user.email || null,
    createdAt: data.created_at,
  }).catch((e) => {
    console.error('[bug-reports] email notification failed:', e?.message || e);
  });

  return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at });
}

export async function GET(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (authError || !user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('st_bug_reports')
    .select('id, title, description, page_context, app_nav, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reports: data || [] });
}
