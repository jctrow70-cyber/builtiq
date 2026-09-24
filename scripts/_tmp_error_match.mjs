import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const err = typeof report.error === "string" ? report.error : JSON.stringify(report.error);
const phrases = ["already present","already exist","duplicate","missing","not found","env","supabase","auth","permission","RLS","count","254","260","id gap","ids 1-260","active master","user catalog","archived","library","external_id","constraint","unique","timeout","network","fetch","insert failed","preflight","unexpected","mismatch","more than","less than","not six","wrong id","olympic","snatch"];
const hits = [];
phrases.forEach(function(p, i) { if (err.toLowerCase().indexOf(p.toLowerCase()) >= 0) hits.push(i); });
fs.writeFileSync("docs/catalog-overhaul/_tmp_error_len2.txt", String(err.length));
fs.writeFileSync("docs/catalog-overhaul/_tmp_error_hits.txt", hits.join(","));
process.exit(10 + hits.length);
