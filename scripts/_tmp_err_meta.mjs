import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const err = String(report.error || "");
fs.writeFileSync("docs/catalog-overhaul/_tmp_error_meta.txt", [err.length, err.slice(0, 80), err.includes("TypeError"), err.includes("at "), err.includes(".ts")].join("|"));
const hundreds = Math.min(90, Math.floor(err.length / 100));
process.exit(10 + hundreds);
