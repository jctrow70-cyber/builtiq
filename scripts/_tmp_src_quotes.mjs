import fs from "fs";
const src = fs.readFileSync("scripts/insert-missing-olympic-master.ts", "utf8");
const quotes = [];
let m;
while ((m = re.exec(src)) !== null) { quotes.push(m[1]); }
fs.writeFileSync("docs/catalog-overhaul/_tmp_src_quotes.txt", quotes.join("\n"));
process.exit(Math.min(180, quotes.length));
