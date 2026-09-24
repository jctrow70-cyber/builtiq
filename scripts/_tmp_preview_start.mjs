import fs from "fs";
const p = fs.readFileSync("docs/catalog-overhaul/_tmp_error_preview.txt", "utf8");
const needle = process.argv[2];
process.exit(p.indexOf(needle) === 0 ? 3 : (p.toLowerCase().indexOf(String(needle).toLowerCase()) === 0 ? 4 : 2));
