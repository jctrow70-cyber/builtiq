#!/usr/bin/env node
/**
 * BIQ-0013: Seed st_exercise_alternatives from curated pairs + movement-pattern matches.
 * Uses service role. Safe to re-run (upserts by exercise_id + alternative_id + reason).
 *
 * Usage:
 *   npm run import:alternatives:dry
 *   npm run import:alternatives
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const BATCH_SIZE = 100;

type CuratedPair = {
  exercise: string;
  alternative: string;
  reason: 'equipment_unavailable' | 'injury' | 'skill_level' | 'preference' | 'similar_stimulus';
  priority: number;
  notes?: string;
};

/** Curated substitutions for common BuildIQ / gym staples */
const CURATED_PAIRS: CuratedPair[] = [
  { exercise: 'Bench Press', alternative: 'Dumbbell Bench Press', reason: 'equipment_unavailable', priority: 1, notes: 'No barbell or rack' },
  { exercise: 'Bench Press', alternative: 'Push-Up', reason: 'equipment_unavailable', priority: 2, notes: 'Bodyweight option' },
  { exercise: 'Back Squat', alternative: 'Goblet Squat', reason: 'equipment_unavailable', priority: 1, notes: 'No rack or barbell' },
  { exercise: 'Back Squat', alternative: 'Bulgarian Split Squat', reason: 'equipment_unavailable', priority: 2 },
  { exercise: 'Romanian Deadlift', alternative: 'Trap Bar Deadlift', reason: 'preference', priority: 1, notes: 'Trap bar hinge option' },
  { exercise: 'Overhead Press', alternative: 'Dumbbell Shoulder Press', reason: 'equipment_unavailable', priority: 1 },
  { exercise: 'Barbell Row', alternative: 'Dumbbell Row', reason: 'equipment_unavailable', priority: 1 },
  { exercise: 'Lat Pulldown', alternative: 'Pull-Up', reason: 'equipment_unavailable', priority: 1, notes: 'No cable machine' },
  { exercise: 'Lat Pulldown', alternative: 'Chin-Up', reason: 'equipment_unavailable', priority: 2 },
  { exercise: 'Deadlift', alternative: 'Trap Bar Deadlift', reason: 'preference', priority: 1 },
  { exercise: 'Incline DB Press', alternative: 'Incline Barbell Press', reason: 'equipment_unavailable', priority: 1 },
  { exercise: 'Cable Row', alternative: 'Dumbbell Row', reason: 'equipment_unavailable', priority: 1 },
  { exercise: 'Seated Leg Curl', alternative: 'Lying Leg Curl', reason: 'preference', priority: 1 },
  { exercise: 'Hip Thrust', alternative: 'Glute Bridge', reason: 'equipment_unavailable', priority: 1 },
];

function loadEnvFiles() {
  const root = process.cwd();
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  let autoMatch = true;
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') dryRun = true;
    else if (a === '--curated-only') autoMatch = false;
    else if (a === '--help' || a === '-h') {
      console.log(`BuildIQ exercise alternatives import (BIQ-0013)

Options:
  --dry-run, -n     Log actions without writing
  --curated-only    Skip auto movement-pattern matches
`);
      process.exit(0);
    }
  }
  return { dryRun, autoMatch };
}

type CatalogRow = {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  movement_pattern: string | null;
  is_system: boolean;
  user_id: string | null;
};

type AltRow = {
  exercise_id: string;
  alternative_id: string;
  reason: CuratedPair['reason'];
  priority: number;
  notes: string | null;
  is_system: true;
};

function nameIndex(rows: CatalogRow[]) {
  const map = new Map<string, CatalogRow>();
  rows.forEach((r) => map.set(String(r.name).toLowerCase().trim(), r));
  return map;
}

function buildCuratedRows(catalog: CatalogRow[]): AltRow[] {
  const byName = nameIndex(catalog);
  const out: AltRow[] = [];
  for (const pair of CURATED_PAIRS) {
    const ex = byName.get(pair.exercise.toLowerCase());
    const alt = byName.get(pair.alternative.toLowerCase());
    if (!ex || !alt || ex.id === alt.id) continue;
    out.push({
      exercise_id: ex.id,
      alternative_id: alt.id,
      reason: pair.reason,
      priority: pair.priority,
      notes: pair.notes || null,
      is_system: true,
    });
  }
  return out;
}

function buildAutoRows(catalog: CatalogRow[], maxPerExercise = 3): AltRow[] {
  const system = catalog.filter((c) => c.is_system && !c.user_id && c.movement_pattern);
  const out: AltRow[] = [];
  const seen = new Set<string>();

  for (const ex of system) {
    const candidates = system
      .filter(
        (alt) =>
          alt.id !== ex.id &&
          alt.movement_pattern === ex.movement_pattern &&
          String(alt.muscle_group || '').toLowerCase() === String(ex.muscle_group || '').toLowerCase() &&
          String(alt.equipment || '').toLowerCase() !== String(ex.equipment || '').toLowerCase()
      )
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .slice(0, maxPerExercise);

    candidates.forEach((alt, i) => {
      const key = `${ex.id}|${alt.id}|equipment_unavailable`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        exercise_id: ex.id,
        alternative_id: alt.id,
        reason: 'equipment_unavailable',
        priority: i + 1,
        notes: `Same ${ex.movement_pattern} pattern · ${alt.equipment || 'alternate equipment'}`,
        is_system: true,
      });
    });
  }
  return out;
}

async function upsertAlternatives(
  supabase: ReturnType<typeof createClient>,
  rows: AltRow[],
  dryRun: boolean
) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    if (dryRun) {
      inserted += chunk.length;
      continue;
    }
    const { data, error } = await supabase
      .from('st_exercise_alternatives')
      .upsert(chunk, { onConflict: 'exercise_id,alternative_id,reason' })
      .select('id');
    if (error) throw new Error(error.message);
    inserted += (data || []).length;
  }

  return { inserted, updated, skipped, total: rows.length };
}

async function main() {
  loadEnvFiles();
  const { dryRun, autoMatch } = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: catalog, error } = await supabase
    .from('st_exercise_catalog')
    .select('id, name, muscle_group, equipment, movement_pattern, is_system, user_id')
    .eq('is_system', true)
    .is('user_id', null);
  if (error) throw new Error(error.message);

  const rows = (catalog || []) as CatalogRow[];
  const curated = buildCuratedRows(rows);
  const auto = autoMatch ? buildAutoRows(rows) : [];
  const merged = new Map<string, AltRow>();
  [...curated, ...auto].forEach((r) => merged.set(`${r.exercise_id}|${r.alternative_id}|${r.reason}`, r));
  const payload = Array.from(merged.values());

  console.log(`Catalog exercises: ${rows.length}`);
  console.log(`Curated pairs:     ${curated.length}`);
  console.log(`Auto matches:      ${auto.length}`);
  console.log(`Total upserts:     ${payload.length}`);
  console.log(`Mode:              ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  const result = await upsertAlternatives(supabase, payload, dryRun);
  console.log(`\nAlternatives ${dryRun ? 'planned' : 'written'}: ${result.total}`);
}

main().catch((err) => {
  console.error('Fatal:', err?.message || err);
  process.exit(1);
});
