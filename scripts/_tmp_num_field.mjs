import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const parent = process.argv[2];
const k = process.argv[3];
const obj = parent === "_" ? report : report[parent];
const v = obj ? obj[k] : undefined;
if (typeof v !== "number") process.exit(1);
process.exit(Math.min(180, v));
