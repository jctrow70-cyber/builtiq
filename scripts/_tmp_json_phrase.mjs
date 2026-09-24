import fs from "fs";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const field = process.argv[3];
const needle = String(process.argv[4] || "").toLowerCase();
const raw = report[field];
const err = raw == null ? "" : (typeof raw === "string" ? raw : JSON.stringify(raw));
process.exit(err.toLowerCase().indexOf(needle) >= 0 ? 3 : 2);
