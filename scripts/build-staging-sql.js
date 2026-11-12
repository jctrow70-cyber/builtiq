/**
 * Build UTF-8 staging replay scripts for Supabase SQL Editor.
 * Do NOT use build-staging-sql.cmd — Windows "echo" creates UTF-16 and corrupts part-01.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const baselinePath = path.join(root, 'supabase-strength-team-schema.sql');
const outDir = path.join(root, 'scripts', 'staging-sql');

const exclude = new Set([
  '20261102_076_planned_set_type_correction.sql',
  '20261103_077_equipment_inference_no_single_implement.sql',
  '20261103_078_progress_history_summaries.sql',
  '20261108_079_preserve_program_equipment.sql',
]);

const readText = (filePath) =>
  fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');

const migrationNames = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql') && !exclude.has(name))
  .sort((a, b) => a.localeCompare(b, 'en'));

function chunksForMigrations(names) {
  const chunks = [];
  for (const name of names) {
    chunks.push('');
    chunks.push(`-- ===== ${name} =====`);
    chunks.push('');
    chunks.push(readText(path.join(migrationsDir, name)));
  }
  return chunks;
}

fs.mkdirSync(outDir, { recursive: true });

const MIGRATIONS_PER_PART_AFTER_FIRST = 12;

const part1Body = [
  '-- BuildIQ Staging schema replay',
  '-- Run part-01, then part-02, and so on, in the Supabase SQL Editor only.',
  '-- Baseline plus migrations through 20261024_075. BIQ-0296+ files listed in manifest.txt are excluded.',
  '',
  '-- ===== supabase-strength-team-schema.sql =====',
  '',
  readText(baselinePath),
  ...chunksForMigrations(migrationNames.slice(0, MIGRATIONS_PER_PART_AFTER_FIRST)),
].join('\n');

fs.writeFileSync(path.join(outDir, 'part-01.sql'), part1Body, { encoding: 'utf8' });

let partIndex = 2;
for (let i = MIGRATIONS_PER_PART_AFTER_FIRST; i < migrationNames.length; i += MIGRATIONS_PER_PART_AFTER_FIRST) {
  const slice = migrationNames.slice(i, i + MIGRATIONS_PER_PART_AFTER_FIRST);
  const body = [
    `-- BuildIQ Staging schema replay part ${partIndex}`,
    ...chunksForMigrations(slice),
  ].join('\n');
  const file = path.join(outDir, `part-${String(partIndex).padStart(2, '0')}.sql`);
  fs.writeFileSync(file, body, { encoding: 'utf8' });
  partIndex += 1;
}

const manifest = [
  `generated ${new Date().toISOString()}`,
  `migrations_included ${migrationNames.length}`,
  ...migrationNames,
  '',
  `excluded ${exclude.size}`,
  ...[...exclude].sort(),
  '',
  `parts ${partIndex - 1}`,
].join('\n');
fs.writeFileSync(path.join(outDir, 'manifest.txt'), manifest, 'utf8');

console.log(`Wrote ${partIndex - 1} UTF-8 parts to ${outDir}`);
console.log(manifest.split('\n').slice(0, 5).join('\n'));
