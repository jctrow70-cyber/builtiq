import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-verify-report.json", "utf8"));
const out = [];
out.push("STATUS=" + report.status);
const keys = Object.keys(report);
out.push("KEYS=" + keys.join(","));
function brief(v) {
  if (v == null) return "null";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return String(v);
  if (Array.isArray(v)) return "array:" + v.length + ":" + JSON.stringify(v).slice(0, 800);
  return "object:" + Object.keys(v).join(",") + ":" + JSON.stringify(v).slice(0, 800);
}
keys.forEach(function(k) { out.push(k + "=" + brief(report[k])); });
fs.writeFileSync("docs/catalog-overhaul/_tmp_verify_brief.txt", out.join("\n"));
process.exit(10 + out.length);
