import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const v = report[process.argv[2]][process.argv[3]];
const n = Number(process.argv[4]);
process.exit(v === n ? 3 : 2);
