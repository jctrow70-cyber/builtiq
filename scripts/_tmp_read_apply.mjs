import fs from "fs";
const p = "docs/catalog-overhaul/active-catalog-enrichment-apply-report.json";
if (!fs.existsSync(p)) { fs.writeFileSync("docs/catalog-overhaul/_tmp_apply_brief.txt", "MISSING"); process.exit(30); }
const report = JSON.parse(fs.readFileSync(p, "utf8"));
const out = [];
out.push("STATUS=" + report.status);
const keys = Object.keys(report);
out.push("KEYS=" + keys.join(","));
function brief(v) {
  if (v == null) return "null";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return String(v);
  if (Array.isArray(v)) return "array:" + v.length + ":" + JSON.stringify(v).slice(0, 1200);
  return "object:" + Object.keys(v).join(",") + ":" + JSON.stringify(v).slice(0, 1200);
}
keys.forEach(function(k) { out.push(k + "=" + brief(report[k])); });
fs.writeFileSync("docs/catalog-overhaul/_tmp_apply_brief.txt", out.join("\n"));
const status = String(report.status || "");
process.exit(status === "applied" ? 10 : 20);
