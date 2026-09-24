import fs from "fs";
const src = fs.readFileSync("scripts/apply-active-catalog-enrichment.ts", "utf8");
const lines = src.split(/\n/);
const hits = [];
for (let i = 0; i < lines.length; i++) {
  if (/Write failed|status|aborted|error|active_rows|rollback/i.test(lines[i])) hits.push(String(i + 1) + ":" + lines[i]);
}
fs.writeFileSync("docs/catalog-overhaul/_tmp_apply_src_hits.txt", hits.join("\n"));
process.exit(Math.min(180, hits.length));
