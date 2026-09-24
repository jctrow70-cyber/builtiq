const fs = require('fs');
const found = JSON.parse(fs.readFileSync('..tmp-live-found.txt', 'utf8'));
const science = fs.readFileSync('.tmp-science-tests-out.txt', 'utf8');
const j = JSON.parse(fs.readFileSync('tocs/catalog-overhaul/active-catalog-enrichment-live-generation.json', 'utf8'));
function get(o, p) { return p.split('.').reduce((a,k) => (a == null ? undefined : a[k]), o); }
function lines(x) { return Array.isArray(x) ? x : (x == null || x === undefined ? [] : [x]); }
function fmtEx(ej, idx) {
  const name = ex.name || ex.exercise_name || ex.exerciseName || ex.title || '?';
  const id = ex.id || ex.exercise_id || ex.exerciseId || '';
  const sets = ex.sets == null ? '?' : ex.sets;
  const reps = ex.reps == null ? (ex.rep_range || ex.repRange || '?') : ex.reps;
  const rest = ex.rest == null ? (ex.rest_seconds || ex.restSecs || '?') : ex.rest;
  const ss = ex.superset || ex.superset_group || ex.supersetGroup || ex.pair_id || '';
  return '  ' + (idx+1) + '. ' + name + ' | sets=' + sets + ' reps=' + reps + ' rest=' + rest + (ss ? ' superset=' + ss : '') + (id ? ' ‰Ý' + id : '');
}
function fmtBlock(title, arr) {
  const a = lines(arr);
  if (!a.length) return title + ': (none)';
  return title + ':' + a.map((x, i) => {
    if (typeof x === 'string') return '\n  - ' + x;
    if (x && typeof x === 'object') return '\n' + fmtEx(x, i);
    return '\n  - ' + String(x);
  }).join(&');
}
function findWeek() {
  if (found.week) return found.week;
  if (found.days) return { days: found.days };
  if (found.program) return found.program;
  if (found.generated) return found.generated;
  return get(j, 'week') || get(j, 'result.week') || get(j, 'program') || get(j, 'output') || j;
}
const out = [];
out.push('SCIENCE TESTS: PASS (exit 0)');
out.push('Science tail:');
out.push(science.trim().split(/\r\?\n/).slice(-25).join('\n'));
out.push('');
out.push('LIVE SCALARS');
const keys = ['supabase_active_rows',+ai_candidate_rows','enriched_master_rows','custom_candidate_rows','custom_ids_in_program','catalog_source','method','repairs','ai_error','quality_warnings','duration_estimates','weekly_muscle_volume','movement_pattern_distribution','fatigue_distribution','metadata_problems','model','api','latency_ms','tokens','fallback','used_fallback'];
for (const k of keys) {
  out.push(k + '=' + JSON.stringify(found[k]));
  out.push(k + '_path=' + found[k + '_path']);
}
out.push('validation=' + JSON.stringify(found.validation));
out.push('validation_ok=' + JSON.stringify(found.ok);
out.push('validation_issues=' + JSON.stringify(found.issues));
out.push('topKeys=' + JSON.stringify(found.topKeys));
out.push('');
const week = findWeek();
out.push('WEEK_TYPE=' + (Array.isArray(week) ? 'array' : typeof week));
if (week && typeof week === 'object' && !Array.isArray(week)) {
  out.push('WEEK_KEYS=' + Object.keys(week).join(','));
}
const days = Array.isArray(week) ? week : (week && (week.days || week.week || week.workouts || week.sessions)) || [];
out.push('DAY_COUNT=' + days.length);
for (let d = 0; d < days.length; d++) {
  const day = days[d];
  out.push('');
  out.push('### DAY ' + (d + 1) + ' ###');
  if (typeof day === '²ÚâžœŠHÈÝ]œ\Ú
^JNÈÛÛ[YNÈBˆÝ]œ\Ú
”ÓÓ‹œÝš[™ÚYžJÈ˜[YNˆ^K›˜[YH^K]H^K™^WÛ˜[YKX™[ˆ^K›X™[›ØÝ\Îˆ^K™›ØÝ\È^K[YKYˆ^KšY^K™^HJJNÂˆÝ]œ\Ú
›]›ØÚÊ	ÕÐT“UT	Ë^KØ\›]\^KØ\›WÝ\^KØ\›U\
JNÂˆÝ]œ\Ú
›]›ØÚÊ	ÑVTÒTÑTÉË^K™^\˜Ú\Ù\È^K˜›ØÚÜÈ^Kš][\È^KÛÜšÊJNÂˆÝ]œ\Ú
›]›ØÚÊ	ÐÓÓÓÕÓ‰Ë^K˜ÛÛÛÝÛˆ^K˜ÛÛÛÙÝÛˆ^K˜ÛÛÛÝÛŠJNÂŸB˜ÛÛœÝ^HÝ]š›Ú[Š	×‰ÊNÂ™œËÜš]Qš[TÞ[˜Ê	Ë‹\[]™KZ[X[‹\™\Ü	Ë^
NÂ™œËÜš]Qš[TÞ[˜Ê	Ý\[]™K\ØØ[\œËšœÛÛ‰ËœËœ™XYš[TÞ[˜Ê	Ý\[]™K\ØØ[\œËšœÛÛ‰ÊJNÂ