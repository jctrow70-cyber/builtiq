import { NextResponse } from 'next/server';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import { isCatalogAdmin } from '../../../../lib/training/catalogAdmin';
import {
  countGuidedCatalogRows,
  createServiceRoleSupabase,
  hasGuidedImportServerConfig,
  importGuidedCatalogToSupabase,
} from '../../../../lib/training/guidedCatalogImport';

/** GET — import readiness + current guided exercise count */
export async function GET(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });

  const isAdmin = isCatalogAdmin(user);
  const serverReady = hasGuidedImportServerConfig();
  const canImport = isAdmin && serverReady;
  let guidedCount = 0;
  if (serverReady) {
    try {
      const admin = createServiceRoleSupabase();
      guidedCount = await countGuidedCatalogRows(admin);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Could not read catalog' }, { status: 500 });
    }
  }

  return NextResponse.json({
    isCatalogAdmin: isAdmin,
    canImport,
    guidedCount,
    expectedCount: 1324,
    message: !isAdmin
      ? 'Catalog import is restricted to BuildIQ Health admins.'
      : canImport
        ? guidedCount > 0
          ? `${guidedCount} guided exercises in your database. You can re-import to refresh.`
          : 'Ready to import ~1,324 exercises with GIF demos and form guides.'
        : 'Add SUPABASE_SERVICE_ROLE_KEY to your server environment (.env.local) to enable one-click import.',
  });
}

/** POST — download ExerciseDB bulk dataset and upsert into st_exercise_catalog */
export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });

  if (!isCatalogAdmin(user)) {
    return NextResponse.json({ error: 'Only BuildIQ Health catalog admins can run imports.' }, { status: 403 });
  }

  if (!hasGuidedImportServerConfig()) {
    return NextResponse.json(
      {
        error:
          'Server is not configured for catalog import. Add SUPABASE_SERVICE_ROLE_KEY to .env.local (same project as your Supabase URL), restart the app, then try again.',
      },
      { status: 503 }
    );
  }

  try {
    const admin = createServiceRoleSupabase();
    const stats = await importGuidedCatalogToSupabase(admin);
    const guidedCount = await countGuidedCatalogRows(admin);
    return NextResponse.json({
      ok: stats.errors === 0,
      stats,
      guidedCount,
      message:
        stats.errors === 0
          ? `Imported ${stats.imported} guided exercises (${stats.inserted} new, ${stats.updated} updated).`
          : `Import finished with ${stats.errors} error(s). ${stats.imported} rows saved.`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Import failed' }, { status: 500 });
  }
}
