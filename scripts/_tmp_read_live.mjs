import fs from "fs";
const p = "docs/catalog-overhaul/active-catalog-enrichment-live-generation.json";
if (!fs.existsSync(p)) { fs.writeFileSync("docs/catalog-overhaul/_tmp_live_brief.txt", "MISSING"); process.exit(30); }
const j = JSON.parse(fs.readFileSync(p, "utf8"));
const out = [];
out.push("TOP_KEYS=" + Object.keys(j).join(","));
function get(obj, path) {
  return path.split(".").reduce(function(a, k) { return a == null ? undefined : a[k]; }, obj);
}
function show(label, v) {
  if (v == null) { out.push(label + "=null"); return; }
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") { out.push(label + "=" + String(v)); return; }
  out.push(label + "=" + JSON.stringify(v));
}
["catalog_source","adapted_active","enriched_rows_in_library","method","repairs","ai_error","quality_warnings","duration_estimates","weekly_muscle_volume","movement_pattern_distribution","fatigue_distribution","metadata_problems","status"].forEach(function(k) { show(k, j[k] != null ? j[k] : get(j, "result." + k)); });
show("validation", j.validation || get(j, "result.validation"));
const raw = JSON.stringify(j);
out.push("HAS_FALLBACK=" + /FALLBACK_CATALOG/i.test(raw));
const hits = [];
function walk(obj, prefix) {
  if (obj == null || typeof obj !== "object") return;
  Object.keys(obj).forEach(function(k) {
    const path = prefix ? prefix + "." + k : k;
    if (/^(model|inputTokens|outputTokens|reasoningTokens|usage|latency|duration_ms|input_tokens|output_tokens|total_tokens)$/i.test(k)) hits.push(path + "=" + JSON.stringify(obj[k]));
    walk(obj[k], path);
  });
}
walk(j, "");
out.push("USAGE_HITS=" + hits.length);
hits.forEach(function(h) { out.push("USAGE " + h); });
fs.writeFileSync("docs/catalog-overhaul/_tmp_live_brief.txt", out.join("\n"));
process.exit(10);
