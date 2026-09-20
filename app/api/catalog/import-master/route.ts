import { NextResponse } from 'next/server';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import { isCatalogAdmin } from '../../../../lib/training/catalogAdmin';
import { createServiceRoleSupabase, hasGuidedImportServerConfig } from '../../../../lib/training/guidedCatalogImport';
import {
  countMasterCatalogRows,
  importMasterCatalogToSupabase,
  masterImportExpectedCount,
} from '../../../../lib/training/masterCatalogImport';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });

  const isAdmin = isCatalogAdmin(user);
  const serverReady = hasGuidedImportServerConfig();
  const canImport = isAdmin && serverReady;
  let masterCount = 0;
  if (serverReady) {
    try {
      masterCount = await countMasterCatalogRows(createServiceRoleSupabase());
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Could not read catalog' }, { status: 500 });
    }
  }

  const expectedCount = masterImportExpectedCount();
  return NextResponse.json({
    isCatalogAdmin: isAdmin,
    canImport,
    masterCount,
    expectedCount,
    message: !isAdmin
      ? 'Catalog import is restricted to BuildIQ Health admins.'
      : canImport
        ? masterCount > 0
          ? `${masterCount} master exercises are live. You can re-run to refresh names and remaps.`
          : `Ready to import ${expectedCount} master exercises, remap household plans, and archive the old library.`
        : 'Add SUPABASE_SERVICE_ROLE_KEY to the server environment to enable import.',
  });
}

export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  if (!isCatalogAdmin(user)) {
    return NextResponse.json({ error: 'Only BuildIQ Health catalog admins can run this import.' }, { status: 403 });
  }
  if (!hasGuidedImportServerConfig()) {
    return NextResponse.json({ error: 'Server is not configured for catalog import.' }, { status: 503 });
  }

  let dryRun = false;
  try {
    const body = await request.json().catch(() => ({}));
    dryRun = !!body?.dryRun;
  } catch {
    dryRun = false;
  }

  try {
    const admin = createServiceRoleSupabase();
    const stats = await importMasterCatalogToSupabase(admin, { dryRun });
    const masterCount = await countMasterCatalogRows(admin);
    return NextResponse.json({
      ok: stats.errors === 0,
      dryRun,
      stats,
      masterCount,
      message: dryRun
        ? `Dry run: would insert ${stats.inserted}, update ${stats.updated}, remap ${stats.remappedExercises} plan rows, archive ${stats.archivedOld} old catalog rows.`
        : stats.errors === 0
          ? `Master library is live (${masterCount} exercises). Remapped ${stats.remappedExercises} plan rows and ${stats.remappedLogs} history links. Archived ${stats.archivedOld} old catalog rows. History names were not changed.`
          : `Finished with ${stats.errors} error(s). ${stats.inserted + stats.updated} master rows saved.`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Import failed' }, { status: 500 });
  }
}
