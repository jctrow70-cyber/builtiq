import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
process.exit(Math.min(180, String(report.error || "").length));
