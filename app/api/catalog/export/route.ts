import { NextResponse } from 'next/server';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import { isCatalogAdmin } from '../../../../lib/training/catalogAdmin';
import { fetchAllExerciseCatalog } from '../../../../lib/training/catalogFetch';
import { catalogRowsToCsv } from '../../../../lib/training/catalogExport';
import { createServiceRoleSupabase, hasGuidedImportServerConfig } from '../../../../lib/training/guidedCatalogImport';

export const runtime = 'nodejs';

/** GET — download the live system exercise catalog as CSV (catalog admin). */
export async function GET(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  if (!isCatalogAdmin(user)) {
    return NextResponse.json({ error: 'Only BuildIQ Health catalog admins can download the exercise database.' }, { status: 403 });
  }

  const client = hasGuidedImportServerConfig() ? createServiceRoleSupabase() : supabase;
  const { data, error } = await fetchAllExerciseCatalog(client);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const systemRows = (data || []).filter((row: any) => row?.is_system !== false && !row?.user_id);
  const csv = catalogRowsToCsv(systemRows);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="builtiq-exercise-catalog-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
