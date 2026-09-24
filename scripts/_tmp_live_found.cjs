const fs = require('fs');
function findKey(obj, name, path, hits) {
  if (obj == null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findKey(v, name, path + '[' + i + ']', hits));
    return;
  }
  for (const k of Object.keys(obj)) {
    const p = path ? path + '.' + k : k;
    if (k === name) hits.push({ path: p, value: obj[k] });
    findKey(obj[k], name, p, hits);
  }
}
try {
  const j = JSON.parse(fs.readFileSync('docs/catalog-overhaul/active-catalog-enrichment-live-generation.json', 'utf8'));
  const wanted = ['supabase_active_rows','ai_candidate_rows','enriched_master_rows','custom_candidate_rows','custom_ids_in_program','catalog_source','method','repairs','ai_error','validation','quality_warnings','duration_estimates','weekly_muscle_volume','movement_pattern_distribution','fatigue_distribution','metadata_problems','model','api','latency_ms','tokens','fallback','used_fallback','week','days','program','generated','issues','ok'];
  const report = { topKeys: Object.keys(j), jsonIsArray: Array.isArray(j) };
  for (const name of wanted) {
    const hits = [];
    findKey(j, name, '', hits);
    report[name] = hits.length ? hits[0].value : null;
    report[name + '_path'] = hits.length ? hits[0].path : null;
  }
  fs.writeFileSync('..tmp-live-found.txt', JSON.stringify(report, null, 2));
  fs.writeFileSync('.tmp-live-found-ok.txt', 'OK topKeys=' + report.topKeys.join(','));
} catch (e) {
  fs.writeFileSync('.tmp-live-found-err.txt', String(e && e.stack ? e.stack : e));
  process.exit(1);
}
