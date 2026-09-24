import fs from "fs";
const p = fs.readFileSync(process.argv[2], "utf8");
const i = Number(process.argv[3] || 0);
process.exit(p.charCodeAt(i) || 1);
