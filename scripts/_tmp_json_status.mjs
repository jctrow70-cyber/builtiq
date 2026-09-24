import fs from "fs";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const s = String(report.status || "unknown");
fs.writeFileSync("docs/catalog-overhaul/_tmp_last_status.txt", s);
const map = {ok:1, applied:2, aborted:3, failed:4, error:5, skipped:6, blocked:7, refused:8, partial:9, already:10, missing:11, mismatch:12};
process.exit(map[s] ? 10 + map[s] : 40 + (s.charCodeAt(0) % 20));
