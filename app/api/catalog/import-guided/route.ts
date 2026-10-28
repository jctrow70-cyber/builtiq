import { NextResponse } from 'next/server';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import { isCatalogAdmin } from '../../../../lib/training/catalogAdmin';
import { EXERCISE_DB_IMPORT_BLOCKED } from '../../../../lib/training/contentRights';
import {
  countGuidedCatalogRows,
  createServiceRoleSupabase,
  hasGuidedImportServerConfig,
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
    canImport: false,
    guidedCount,
    expectedCount: 1324,
    message: !isAdmin
      ? 'Catalog import is restricted to BuildIQ Health admins.'
      : canImport
        ? `${guidedCount} ExerciseDB rows are still stored. Import is disabled until commercial rights are verified.`
        : 'ExerciseDB import is disabled until commercial rights are verified.',
  });
}

/** POST — refused until ExerciseDB commercial rights are verified. No rows are written. */
export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });

  if (!isCatalogAdmin(user)) {
    return NextResponse.json({ error: 'Only BuildIQ Health catalog admins can run imports.' }, { status: 403 });
  }

  return NextResponse.json({ error: EXERCISE_DB_IMPORT_BLOCKED }, { status: 403 });
}
