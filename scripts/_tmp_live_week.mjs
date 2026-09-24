import fs from "fs";
const j = JSON.parse(fs.readFileSync("docs/catalog-overhaul/active-catalog-enrichment-live-generation.json", "utf8"));
function findWeek(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj.days) && obj.days.length) return obj;
  if (Array.isArray(obj.week)) return { days: obj.week };
  if (Array.isArray(obj.workouts)) return { days: obj.workouts };
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) { const f = findWeek(obj[keys[i]]); if (f) return f; }
  return null;
}
const week = findWeek(j);
const lines = [];
if (!week) { lines.push("NO_WEEK"); fs.writeFileSync("docs/catalog-overhaul/_tmp_live_week.txt", lines.join("\n")); process.exit(20); }
const days = week.days || [];
lines.push("DAY_COUNT=" + days.length);
days.forEach(function(day, di) {
  const label = day.name || day.day || day.title || day.label || ("Day " + (di + 1));
  lines.push("DAY " + (di + 1) + " " + label);
  const exs = day.exercises || day.items || day.blocks || [];
  if (!Array.isArray(exs) || !exs.length) { lines.push("  " + JSON.stringify(day).slice(0, 800)); return; }
  exs.forEach(function(ex, ei) {
    const name = ex.name || ex.exercise_name || ex.exercise || ex.title || ("ex" + ei);
    const sets = ex.sets != null ? ex.sets : (ex.prescription && ex.prescription.sets);
    const reps = ex.reps != null ? ex.reps : (ex.prescription && ex.prescription.reps);
    const rest = ex.rest != null ? ex.rest : (ex.rest_sec != null ? ex.rest_sec : (ex.prescription && ex.prescription.rest));
    const ss = ex.superset || ex.superset_id || ex.group || "";
    const notes = ex.notes || ex.coaching_notes || ex.cue || "";
    lines.push("  EX " + name + " | sets=" + sets + " reps=" + reps + " rest=" + rest + " ss=" + ss + " notes=" + notes);
  });
});
fs.writeFileSync("docs/catalog-overhaul/_tmp_live_week.txt", lines.join("\n"));
process.exit(10 + days.length);
