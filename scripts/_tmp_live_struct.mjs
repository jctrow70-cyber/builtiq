import fs from "fs";
const j = JSON.parse(fs.readFileSync("docs/catalog-overhaul/active-catalog-enrichment-live-generation.json", "utf8"));
function shape(v, depth) {
  if (v == null) return "null";
  const t = typeof v;
  if (t !== "object") return t + ":" + String(v).slice(0, 80);
  if (Array.isArray(v)) return "array:" + v.length + (depth < 2 && v[0] ? ":" + shape(v[0], depth + 1) : "");
  const ks = Object.keys(v);
  const inner = depth < 2 ? ks.map(function(k) { return k + "=" + shape(v[k], depth + 1); }).join(";") : ks.join(",");
  return "object[" + ks.length + "]:" + inner;
}
const lines = Object.keys(j).map(function(k) { return k + " => " + shape(j[k], 0); });
fs.writeFileSync("docs/catalog-overhaul/_tmp_live_struct.txt", lines.join("\n"));
process.exit(10 + lines.length);
