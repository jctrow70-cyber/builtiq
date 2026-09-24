import fs from "fs";
const p = fs.readFileSync("docs/catalog-overhaul/_tmp_error_preview.txt", "utf8");
const i = Number(process.argv[2] || 0);
process.exit(p.charCodeAt(i) || 1);
