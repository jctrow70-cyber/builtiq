import fs from "fs";
const line = fs.readFileSync(process.argv[2], "utf8");
const i = line.indexOf("=");
const v = i >= 0 ? line.slice(i + 1) : line;
fs.writeFileSync("docs/catalog-overhaul/_tmp_val.txt", v);
const map = {undefined:1,null:2,"0":3,"260":4,"254":5,applied:6,true:7,false:8,ok:9,openai:10,ai:11,live:12,none:13,"[]":14,"{}":15,enriched_active_prod:16};
if (map[v] != null) process.exit(10 + map[v]);
if (/^[0-9]+$/.test(v)) process.exit(Math.min(180, Number(v)));
process.exit(40 + Math.min(20, v.length));
