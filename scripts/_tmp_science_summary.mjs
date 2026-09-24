import fs from "fs";
const p = "C:/Users/JesseTrowbridge/.cursor/projects/c-Users-JesseTrowbridge-OneDrive-Tegria-Documents-GitHub-builtiq/agent-tools/6b0b4fae-bdfc-4666-853a-aa4c85359b2b.txt";
const t = fs.readFileSync(p, "utf8");
const lines = t.split(/\n/).filter(function(l) { return /PASS|FAIL|pass|fail|ok|failed|Acceptance|test/i.test(l) && l.length < 400; });
fs.writeFileSync("docs/catalog-overhaul/_tmp_science_hits.txt", lines.slice(-40).join("\n"));
const fail = lines.filter(function(l) { return /FAIL|failed/i.test(l); });
process.exit(fail.length === 0 ? 10 : 20 + Math.min(20, fail.length));
