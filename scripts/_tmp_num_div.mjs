import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const v = report[process.argv[2]][process.argv[3]];
if (typeof v !== "number") process.exit(1);
process.exit(Math.min(180, Math.floor(v / 10)));
