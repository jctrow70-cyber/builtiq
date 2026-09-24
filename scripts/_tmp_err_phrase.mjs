import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const err = String(report.error || "").toLowerCase();
const p = String(process.argv[2] || "").toLowerCase();
process.exit(err.indexOf(p) >= 0 ? 3 : 2);
