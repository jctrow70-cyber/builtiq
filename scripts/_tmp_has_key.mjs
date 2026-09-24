import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const k = process.argv[2];
process.exit(report[k] === undefined ? 2 : 3);
