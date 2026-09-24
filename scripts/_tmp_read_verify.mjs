import fs from "fs";
const report = JSON.parse(fs.readFileSync("docs/catalog-overhaul/missing-olympic-verify-report.json", "utf8"));
const lines = [];
function dump(obj, prefix) {
  if (obj == null) { lines.push(prefix + "=null"); return; }
  const t = typeof obj;
  if (t === "string" || t === "number" || t === "boolean") { lines.push(prefix + "=" + String(obj)); return; }
  if (Array.isArray(obj)) { lines.push(prefix + ".length=" + obj.length); obj.forEach(function(v, i) { dump(v, prefix + "[" + i + "]"); }); return; }
  if (t === "object") { const ks = Object.keys(obj); lines.push(prefix + ".keys=" + ks.join(",")); ks.forEach(function(k) { dump(obj[k], prefix ? prefix + "." + k : k); }); }
}
dump(report, "");
fs.writeFileSync("docs/catalog-overhaul/_tmp_verify_flat.txt", lines.join("\n"));
const status = String(report.status || "");
process.exit(status === "ok" ? 10 : 20);
