const fs = require('fs');
const found = JSON.parse(fs.readFileSync('..tmp-live-found.txt', 'utf8'));
const science = fs.readFileSync('.tmp-science-tests-out.txt', 'utf8');
const scienceFailed = /AssertionError|not ok|\nFAIL|failed assertion/i.test(science) && !/0 failed/i.test(science);
const lines = [];
lines.push('SCIENCE_TESTS=' + (scienceFailed ? 'FAIL' : 'PASS'));
lines.push('SCIENCE_LINES=' + science.split(/\r\?\n/).length);
lines.push('SCIENCE_TAIL===');
lines.push(science.trim().slice(-2000));
lines.push('===LIVE_SGCALARS===');
const scalarKeys = ['supabase_active_rows','ai_candidate_rows','enriched_master_rows','custom_candidate_rows','custom_ids_in_program','catalog_source','method','repairs','ai_error','validation','quality_warnings','duration_estimates','weekly_muscle_volume','movement_pattern_distribution','fatigue_distribution','metadata_problems','model','api','latency_ms','tokens','fallback','used_fallback','ok','issues'];
for (const k of scalarKeys) {
  lines.push(k + '');
  lines.push('  path: ' + found[k + '_path']);
  lines.push('  value: ' + JSON.stringify(found[k], null, 2));
}
lines.push('topKeys=' + JSON.stringify(found.topKeys));
lines.push('===WEEK===');
const week = found.week || (found.program && found.program.weeks && found.program.weeks[0]) || found.days || found.generated;
lines.push(JSON.stringify(week, null, 2));
const text = lines.join('\n');
fs.writeFileSync('.tmp-live-full-report.txt', text);
fs.writeFileSync('tmp-live-scalars.json', JSON.stringify({topKeys:found.topKeys,supabase_active_rows:found.supabase_active_rows,ai_candidate_rows:found.ai_candidate_rows,enriched_master_rows:found.enriched_master_rows,custom_candidate_rows:found.custom_candidate_rows,custom_ids_in_program:found.custom_ids_in_program,catalog_source:found.catalog_source,method:found.method,repairs:found.repairs,ai_error:found.ai_error,validation:found.validation,quality_warnings:found.quality_warnings,duration_estimates:found.duration_estimates,weekly_muscle_volume:found.weekly_muscle_volume,movement_pattern_distribution:found.movement_pattern_distribution,fatigue_distribution:found.fatigue_distribution,metadata_problems:found.metadata_problems,model:found.model,api:found.api,latency_ms:found.latency_ms,tokens:found.tokens,fallback:found.fallback,used_fallback:found.used_fallback,ok:found.ok,issues:found.issues}, null, 2));
