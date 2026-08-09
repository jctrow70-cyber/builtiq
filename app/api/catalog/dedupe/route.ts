import { NextResponse } from 'next/server';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import { isCatalogAdmin } from '../../../../lib/training/catalogAdmin';
import { findCatalogDuplicateGroups } from '../../../../lib/training/catalogDedupe';
import { createServiceRoleSupabase, hasGuidedImportServerConfig } from '../../../../lib/training/guidedCatalogImport';

export const runtime = 'nodejs';

async function catalogIdsWithLogs(admin: any, catalogIds: string[]): Promise<Set<string>> {
  const withLogs = new Set<string>();
  if (!catalogIds.length) return withLogs;

  const { data: exerciseRefs } = await admin
    .from('st_exercises')
    .select('catalog_exercise_id')
    .in('catalog_exercise_id', catalogIds);
  (exerciseRefs || []).forEach((row: any) => {
    if (row.catalog_exercise_id) withLogs.add(String(row.catalog_exercise_id));
  });

  const { data: logRefs } = await admin
    .from('st_set_logs')
    .select('snapshot_catalog_exercise_id')
    .in('snapshot_catalog_exercise_id', catalogIds)
    .limit(5000);
  (logRefs || []).forEach((row: any) => {
    if (row.snapshot_catalog_exercise_id) withLogs.add(String(row.snapshot_catalog_exercise_id));
  });

  return withLogs;
}

/** GET — duplicate group summary for admins */
export async function GET(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  if (!isCatalogAdmin(user)) return NextResponse.json({ error: 'Catalog admin only' }, { status: 403 });
  if (!hasGuidedImportServerConfig()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY required for catalog dedupe.' }, { status: 503 });
  }

  const admin = createServiceRoleSupabase();
  const { data: catalog, error } = await admin.from('st_exercise_catalog').select('*').eq('is_archived', false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = findCatalogDuplicateGroups(catalog || []);
  return NextResponse.json({
    duplicateGroups: groups.length,
    examples: groups.slice(0, 12).map((g) => ({
      matchKey: g.matchKey,
      keep: g.canonical.name,
      duplicates: g.duplicates.map((d) => d.name),
    })),
  });
}

/** POST — archive duplicate catalog rows without logs; remap references to canonical id */
export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (!user) return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  if (!isCatalogAdmin(user)) return NextResponse.json({ error: 'Catalog admin only' }, { status: 403 });
  if (!hasGuidedImportServerConfig()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY required for catalog dedupe.' }, { status: 503 });
  }

  const admin = createServiceRoleSupabase();
  const { data: catalog, error: catErr } = await admin.from('st_exercise_catalog').select('*').eq('is_archived', false);
  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });

  const groups = findCatalogDuplicateGroups(catalog || []);
  const allDupIds = groups.flatMap((g) => g.duplicates.map((d) => String(d.id)));
  const withLogs = await catalogIdsWithLogs(admin, allDupIds);

  let archived = 0;
  let remappedExercises = 0;
  let remappedLogs = 0;
  let skippedWithHistory = 0;

  for (const group of groups) {
    const canonicalId = String(group.canonical.id);
    for (const dup of group.duplicates) {
      const dupId = String(dup.id);
      if (withLogs.has(dupId)) {
        skippedWithHistory++;
        continue;
      }

      const { error: exErr, count: exCount } = await admin
        .from('st_exercises')
        .update({ catalog_exercise_id: canonicalId })
        .eq('catalog_exercise_id', dupId);
      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
      remappedExercises += exCount || 0;

      const { error: logErr, count: logCount } = await admin
        .from('st_set_logs')
        .update({ snapshot_catalog_exercise_id: canonicalId })
        .eq('snapshot_catalog_exercise_id', dupId);
      if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });
      remappedLogs += logCount || 0;

      const { error: archErr } = await admin
        .from('st_exercise_catalog')
        .update({ is_archived: true })
        .eq('id', dupId);
      if (archErr) return NextResponse.json({ error: archErr.message }, { status: 500 });
      archived++;
    }
  }

  return NextResponse.json({
    duplicateGroups: groups.length,
    archived,
    skippedWithHistory,
    remappedExercises,
    remappedLogs,
    message:
      archived > 0
        ? `Archived ${archived} duplicate catalog entries and remapped program references. ${skippedWithHistory} duplicate(s) kept because they have logged history.`
        : skippedWithHistory > 0
          ? `No duplicates archived — ${skippedWithHistory} duplicate(s) have logged history and were kept. History still merges by exercise name in the app.`
          : 'No duplicate catalog entries found.',
  });
}
