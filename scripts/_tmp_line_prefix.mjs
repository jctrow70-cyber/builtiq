import fs from "fs";
const line = fs.readFileSync(process.argv[2], "utf8");
const known = ["DAY_COUNT=","DAY 1","DAY 2","DAY 3","DAY 4","  EX ","TOP_KEYS=","catalog_source=","adapted_active=","enriched_rows_in_library=","method=","repairs=","ai_error=","quality_warnings=","duration_estimates=","weekly_muscle_volume=","movement_pattern_distribution=","fatigue_distribution=","metadata_problems=","status=","validation=","HAS_FALLBACK=","USAGE_HITS=","USAGE ","STATUS=","NO_WEEK"];
let idx = 99;
for (let i = 0; i < known.length; i++) { if (line.indexOf(known[i]) === 0) { idx = i; break; } }
fs.writeFileSync("docs/catalog-overhaul/_tmp_one_line.txt", line.slice(0, 240));
process.exit(10 + idx);
