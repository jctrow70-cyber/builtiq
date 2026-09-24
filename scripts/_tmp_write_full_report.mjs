import fs from "fs";
const apply = JSON.parse(fs.readFileSync("docs/catalog-overhaul/active-catalog-enrichment-apply-report.json", "utf8"));
const live = JSON.parse(fs.readFileSync("docs/catalog-overhaul/active-catalog-enrichment-live-generation.json", "utf8"));
const rb = JSON.parse(fs.readFileSync("docs/catalog-overhaul/active-catalog-enrichment-rollback.json", "utf8"));
const lines = [];
lines.push("# Apply");
lines.push("status=" + apply.status);
lines.push("active_rows_updated=" + apply.active_rows_updated);
lines.push("archived_rows_modified=" + apply.archived_rows_modified);
lines.push("after_active_master=" + apply.after_active_master);
lines.push("error=" + apply.error);
lines.push("rollback_rows=" + (rb.rows ? rb.rows.length : "no-rows"));
lines.push("# Live keys " + Object.keys(live).join(","));
function dump(obj, prefix) {
  if (obj == null) { lines.push(prefix + "=null"); return; }
  const t = typeof obj;
  if (t !== "object") { lines.push(prefix + "=" + String(obj)); return; }
  if (Array.isArray(obj)) {
    lines.push(prefix + ".length=" + obj.length);
    obj.forEach(function(v, i) { dump(v, prefix + "[" + i + "]"); });
    return;
  }
  Object.keys(obj).forEach(function(k) { dump(obj[k], prefix ? prefix + "." + k : k); });
}
["catalog_source","adapted_active","enriched_rows_in_library","method","repairs","ai_error","quality_warnings","duration_estimates","weekly_muscle_volume","movement_pattern_distribution","fatigue_distribution","metadata_problems","validation"].forEach(function(k) { dump(live[k], k); });
lines.push("# Program");
dump(live.program, "program");
lines.push("# Usage walk");
function walk(obj, prefix) {
  if (!obj || typeof obj !== "object") return;
  Object.keys(obj).forEach(function(k) {
    const path = prefix ? prefix + "." + k : k;
    if (/model|token|usage|latency|duration/i.test(k)) lines.push("USAGE " + path + "=" + JSON.stringify(obj[k]));
    walk(obj[k], path);
  });
}
walk(live, "");
lines.push("FALLBACK=" + /FALLBACK_CATALOG/i.test(JSON.stringify(live)));
fs.writeFileSync("docs/catalog-overhaul/_tmp_full_report.txt", lines.join("\n"));
process.exit(10 + Math.min(80, lines.length));
