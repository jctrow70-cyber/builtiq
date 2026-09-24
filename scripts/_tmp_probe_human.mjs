import fs from "fs";
const lines = fs.readFileSync("docs/catalog-overhaul/_tmp_insert_human.txt", "utf8").split(/\n/);
const n = Number(process.argv[2] || "0");
const line = lines[n] || "";
fs.writeFileSync("docs/catalog-overhaul/_tmp_human_line.txt", line);
const known = ["STATUS=aborted","STATUS=inserted","KEYS=","error=","inserted=","inserted.length=","before=","after=","missing_ids=","duplicates=","reason=","message=","ok=","counts=","WRAP_CHARS=","FLAT_CHARS="];
let idx = 99;
for (let i = 0; i < known.length; i++) { if (line.indexOf(known[i]) === 0 || line === known[i]) { idx = i; break; } }
process.exit(10 + idx);
