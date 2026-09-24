/**
 * Read-only: list active catalog rows that are not builtiq_master.
 * Does not update, archive, or delete anything.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE } from '../lib/training/masterCatalog';
import { ENRICHMENT_VERSION } from '../lib/scienceEngine/catalogEnrichment/storage';

const OUT = path.join(process.cwd(), 'docs/catalog-overhaul/extra-active-catalog-audit.json');
const FOCUS = ['cable curl', 'cable tricep pushdown', 'hip thrust'];

function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function norm(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string) {
  return norm(value)
    .split(' ')
    .filter((w) => w.length > 2 && !['the', 'and', 'with', 'for'].includes(w));
}

function overlap(a: string, b: string) {
  const at = new Set(tokens(a));
  const bt = tokens(b);
  if (!at.size || !bt.length) return 0;
  return bt.filter((t) => at.has(t)).length / Math.max(at.size, bt.length);
}

async function fetchAll(supabase: any) {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('st_exercise_catalog').select('*').order('name').range(from, from + 999);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const rows = await fetchAll(supabase);
  const active = rows.filter((row) => row.is_archived !== true);
  const master = active.filter((row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id);
  const extra = active.filter((row) => !(row.external_source === MASTER_CATALOG_SOURCE && !row.user_id));

  const extras = extra.map((row) => {
    const aliases = Array.isArray(row.coaching_metadata?.aliases) ? row.coaching_metadata.aliases.map(norm) : [];
    const exact = master.filter((m) => norm(m.name) === norm(row.name) || aliases.includes(norm(m.name)));
    const semantic = master
      .map((m) => ({
        id: m.id,
        name: m.name,
        external_id: m.external_id,
        score: Math.max(overlap(row.name, m.name), overlap(m.name, row.name)),
      }))
      .filter((m) => m.score >= 0.5 && !exact.some((e) => e.id === m.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    let match_kind = 'unique';
    if (exact.length) match_kind = 'exact_duplicate';
    else if (semantic[0]?.score >= 0.75) match_kind = 'likely_semantic_duplicate';
    else if (semantic.length) match_kind = 'possible_semantic_overlap';

    const system = row.is_system !== false && !row.user_id;
    const userOwned = Boolean(row.user_id) || row.is_system === false;
    return {
      exercise_id: row.id,
      name: row.name,
      source: row.external_source || null,
      external_id: row.external_id || null,
      is_archived: row.is_archived === true,
      is_system: row.is_system !== false,
      user_id: row.user_id || null,
      ownership: userOwned ? 'user_or_custom' : system ? 'system_non_master' : 'unknown',
      movement_pattern: row.movement_pattern || null,
      equipment: row.equipment || null,
      category: row.category || null,
      enrichment_version: row.coaching_metadata?.enrichment_version || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      exact_master_matches: exact.map((m) => ({ id: m.id, name: m.name, external_id: m.external_id })),
      likely_master_matches: semantic,
      match_kind,
      focus_row: FOCUS.includes(norm(row.name)),
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    read_only: true,
    supabase_host: new URL(url).host,
    totals: {
      all_rows: rows.length,
      active: active.length,
      active_master: master.length,
      extra_active: extras.length,
      extra_user_or_custom: extras.filter((r) => r.ownership === 'user_or_custom').length,
      extra_system_non_master: extras.filter((r) => r.ownership === 'system_non_master').length,
      enriched_master: master.filter((r) => r.coaching_metadata?.enrichment_version === ENRICHMENT_VERSION).length,
    },
    extras,
    focus: extras.filter((r) => r.focus_row),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
