import fs from "fs";
const src = fs.readFileSync("scripts/live-enriched-catalog-generation.ts", "utf8");
const lines = src.split(/\n/);
const hits = [];
for (let i = 0; i < lines.length; i++) {
  if (/catalog_source|adapted_active|enriched_rows|FALLBACK|method|repairs|writeFile|days|exercises/i.test(lines[i])) hits.push(String(i + 1) + ":" + lines[i].slice(0, 160));
}
fs.writeFileSync("docs/catalog-overhaul/_tmp_live_src_hits.txt", hits.join("\n"));
process.exit(Math.min(180, hits.length));
