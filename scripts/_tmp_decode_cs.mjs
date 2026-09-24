import fs from "fs";
const s = fs.readFileSync("docs/catalog-overhaul/_tmp_cs.txt", "utf8");
const i = Number(process.argv[2] || 0);
process.exit(s.charCodeAt(i) || 1);
