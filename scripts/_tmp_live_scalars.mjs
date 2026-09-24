import fs from "fs";
const j = JSON.parse(fs.readFileSync("docs/catalog-overhaul/active-catalog-enrichment-live-generation.json", "utf8"));
function pick(obj, names) { for (let i = 0; i < names.length; i++) { if (obj && obj[names[i]] != null) return obj[names[i]]; } return null; }
const src = pick(j, ["catalog_source","source"]) || pick(j.result || {}, ["catalog_source"]);
const method = pick(j, ["method"]) || pick(j.result || {}, ["method"]);
fs.writeFileSync("docs/catalog-overhaul/_tmp_cs.txt", String(src));
fs.writeFileSync("docs/catalog-overhaul/_tmp_method.txt", String(method));
const adapted = j.adapted_active;
const enriched = j.enriched_rows_in_library;
fs.writeFileSync("docs/catalog-overhaul/_tmp_live_nums.txt", [adapted, enriched, typeof adapted, typeof enriched].join("|"));
const keys = Object.keys(j);
fs.writeFileSync("docs/catalog-overhaul/_tmp_live_keys.txt", keys.join("\n"));
const map = {supabase:1,enriched:2,live:3,master:4,active:5,FALLBACK_CATALOG:6,openai:7,ai:8,generated:9,enriched_active:10,supabase_active:11};
process.exit(map[String(src)] ? 10 + map[String(src)] : 40);
