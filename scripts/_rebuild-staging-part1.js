const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const outDir = path.join(root, "scripts", "staging-sql");
const exclude = new Set([
  "20261102_076_planned_set_type_correction.sql",
  "20261103_077_equipment_inference_no_single_implement.sql",
  "20261103_078_progress_history_summaries.sql",
  "20261108_079_preserve_program_equipment.sql",
]);

const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql") && !exclude.has(name))
  .sort((a, b) => a.localeCompare(b, "en"));

const firstPart = files.slice(0, 12);
const chunks = [
  "-- BuildIQ Staging schema replay",
  "-- Run part-01, then part-02, and so on, in the Staging SQL Editor only.",
  "-- Baseline plus migrations through 20261024_075. BIQ-0296 and later unapplied files are excluded.",
  "",
  "-- ===== supabase-strength-team-schema.sql =====",
  "",
  fs.readFileSync(path.join(root, "supabase-strength-team-schema.sql"), "utf8").replace(/^\uFEFF/, ""),
];

for (const name of firstPart) {
  chunks.push("");
  chunks.push(`-- ===== ${name} =====`);
  chunks.push("");
  chunks.push(fs.readFileSync(path.join(migrationsDir, name), "utf8").replace(/^\uFEFF/, ""));
}

const outPath = path.join(outDir, "part-01-plain.sql");
fs.writeFileSync(outPath, chunks.join("\n"), { encoding: "utf8" });

const report = [
  `wrote ${outPath}`,
  `bytes ${fs.statSync(outPath).size}`,
  `files ${firstPart.length}`,
  ...firstPart,
].join("\n");
fs.writeFileSync(path.join(outDir, "_part1-rebuild.txt"), report, "utf8");
