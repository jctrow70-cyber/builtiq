import fs from "fs";
const lines = fs.readFileSync("docs/catalog-overhaul/_tmp_full_report.txt", "utf8").split(/\n/);
const head = lines.slice(0, 40);
fs.writeFileSync("docs/catalog-overhaul/_tmp_report_head.txt", head.join("\n"));
head.forEach(function(l, i) { fs.writeFileSync("docs/catalog-overhaul/_tmp_rh_" + i + ".txt", l); });
process.exit(10 + head.length);
