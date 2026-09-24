import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-insert-report.json", "utf8"));
const wrap = fs.existsSync("docs/catalog-overhaul/_tmp_wrap_info.txt") ? fs.readFileSync("docs/catalog-overhaul/_tmp_wrap_info.txt", "utf8") : "";
const flat = fs.existsSync("docs/catalog-overhaul/_tmp_report_fullflat.txt") ? fs.readFileSync("docs/catalog-overhaul/_tmp_report_fullflat.txt", "utf8") : "";
const out = [];
out.push("STATUS=" + report.status);
const keys = Object.keys(report);
out.push("KEYS=" + keys.join(","));
keys.forEach(function(k) {
  const v = report[k];
  const t = typeof v;
  if (v == null) out.push(k + "=null");
  else if (t === "string" || t === "number" || t === "boolean") out.push(k + "=" + String(v));
  else if (Array.isArray(v)) {
    out.push(k + ".length=" + v.length);
    v.forEach(function(item, i) { out.push(k + "[" + i + "]=" + JSON.stringify(item)); });
  } else {
    out.push(k + "=" + JSON.stringify(v));
  }
});
out.push("WRAP_CHARS=" + wrap.length);
out.push("FLAT_CHARS=" + flat.length);
fs.writeFileSync("docs/catalog-overhaul/_tmp_insert_human.txt", out.join("\n"));
process.exit(10 + out.length);
