import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const k = process.argv[2];
const v = report[k];
if (v === undefined) process.exit(2);
if (v === null) process.exit(3);
if (typeof v === "string") { fs.writeFileSync("docs/catalog-overhaul/_tmp_field_str.txt", v); process.exit(4); }
if (typeof v === "number") { process.exit(10 + Math.min(80, Number(v))); }
if (typeof v === "boolean") process.exit(v ? 6 : 5);
if (Array.isArray(v)) { process.exit(20 + Math.min(30, v.length)); }
if (typeof v === "object") { const ks = Object.keys(v); fs.writeFileSync("docs/catalog-overhaul/_tmp_field_objkeys.txt", ks.join(",")); process.exit(50 + Math.min(20, ks.length)); }
process.exit(9);
