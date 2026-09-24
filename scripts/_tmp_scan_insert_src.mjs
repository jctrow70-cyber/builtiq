import fs from "fs";
const src = fs.readFileSync("scripts/insert-missing-olympic-master.ts", "utf8");
const lines = src.split(/\n/);
const hits = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/status|aborted|error|writeFile|report|inserted|missing|duplicate|before|after|count/i.test(l)) {
    hits.push(String(i + 1) + ":" + l);
  }
}
fs.writeFileSync("docs/catalog-overhaul/_tmp_insert_src_hits.txt", hits.join("\n"));
process.exit(Math.min(180, hits.length));
