import fs from "fs";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const raw = report[process.argv[3]];
const err = raw == null ? "" : (typeof raw === "string" ? raw : JSON.stringify(raw));
fs.writeFileSync("docs/catalog-overhaul/_tmp_last_error.txt", err);
process.exit(Math.min(180, err.length));
