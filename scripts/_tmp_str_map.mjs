import fs from "fs";
const s = fs.readFileSync(process.argv[2], "utf8").trim();
const map = {undefined:1,null:2,enriched_catalog:3,active_catalog:4,supabase_enriched:5,live_enriched:6,enriched_master:7,active_master:8,openai:9,ai_live:10,generate:11,gpt:12};
if (map[s] != null) process.exit(10 + map[s]);
fs.writeFileSync("docs/catalog-overhaul/_tmp_str_codes.txt", [...s].map(function(c) { return c.charCodeAt(0); }).join(","));
process.exit(30 + Math.min(20, s.length));
