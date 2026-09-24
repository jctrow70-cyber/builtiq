import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const parent = process.argv[2];
const k = process.argv[3];
const obj = report[parent];
if (!obj || typeof obj !== "object") process.exit(2);
process.exit(obj[k] === undefined ? 4 : 5);
