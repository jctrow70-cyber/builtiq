/**
 * Download the public Guided Library (~1,324 exercises) as a CSV for catalog overhaul.
 * Run: npx tsx scripts/export-guided-catalog-csv.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GUIDED_CATALOG_BULK_URL } from '../lib/training/guidedCatalogImport';
import { convertExerciseDatasetBulkRows } from '../lib/training/exerciseDbImport';
import { mapImportRecord } from '../lib/training/catalogImportMap';
import { catalogRowsToCsv } from '../lib/training/catalogExport';

async function main() {
  const res = await fetch(GUIDED_CATALOG_BULK_URL);
  if (!res.ok) throw new Error(`Failed to download guided catalog (${res.status})`);
  const rows = (await res.json()) as any[];
  if (!Array.isArray(rows)) throw new Error('Guided catalog must be a JSON array');
  const records = convertExerciseDatasetBulkRows(rows);
  const mapped = records
    .map((record) => mapImportRecord(record))
    .filter((row): row is Exclude<typeof row, { error: string }> => !('error' in row));
  const csv = catalogRowsToCsv(mapped);
  const out = join(process.cwd(), 'docs', 'catalog-overhaul', 'exercise-catalog.csv');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, csv, 'utf8');
  console.log(`Wrote ${mapped.length} exercises to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
