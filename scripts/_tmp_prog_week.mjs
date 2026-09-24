import fs from "fs";
const j = JSON.parse(fs.readFileSync("docs/catalog-overhaul/active-catalog-enrichment-live-generation.json", "utf8"));
const p = j.program || {};
fs.writeFileSync("docs/catalog-overhaul/_tmp_prog_keys.txt", Object.keys(p).join(","));
const days = p.days || p.week || p.workouts || p.sessions || [];
const lines = [];
lines.push("PROG_KEYS=" + Object.keys(p).join(","));
lines.push("DAYS=" + (Array.isArray(days) ? days.length : typeof days));
if (Array.isArray(days)) {
  days.forEach(function(day, di) {
    const dkeys = day && typeof day === "object" ? Object.keys(day).join(",") : typeof day;
    lines.push("DAYMETA " + di + " keys=" + dkeys);
    const exs = (day && (day.exercises || day.items || day.movements || day.blocks)) || [];
    lines.push("DAYMETA " + di + " excount=" + (Array.isArray(exs) ? exs.length : 0));
    if (Array.isArray(exs)) {
      exs.forEach(function(ex, ei) {
        lines.push("EX " + JSON.stringify(ex));
      });
    }
  });
}
fs.writeFileSync("docs/catalog-overhaul/_tmp_prog_week.txt", lines.join("\n"));
process.exit(10 + (Array.isArray(days) ? days.length : 0));
