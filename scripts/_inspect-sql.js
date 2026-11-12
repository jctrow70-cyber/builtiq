const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const log = [];
const println = (line) => log.push(line);

function inspectFile(rel) {
  const p = path.join(root, rel);
  const b = fs.readFileSync(p);
  const text = b.toString('utf8');
  const idx = text.indexOf('Jesse');
  const lines = text.split(/\r?\n/);
  println('FILE ' + rel + ' bytes ' + b.length + ' lines ' + lines.length);
  println('  first bytes: ' + [...b.slice(0, 4)].map((x) => x.toString(16)).join(' '));
  if (idx >= 0) println('  Jesse at ' + idx + ' ' + JSON.stringify(text.slice(idx - 30, idx + 50)));
  if (lines.length >= 135) {
    println('  line 135: ' + JSON.stringify(lines[134]));
    println('  line 134: ' + JSON.stringify(lines[133]));
  }
}

inspectFile('scripts/staging-sql/part-01.sql');

const mig = path.join(root, 'supabase/migrations');
for (const f of fs.readdirSync(mig).filter((x) => x.endsWith('.sql'))) {
  const b = fs.readFileSync(path.join(mig, f));
  if (b.includes(Buffer.from('Jesse')) || (b[0] === 0xd0 && b[1] === 0xcf) || (b[0] === 0x50 && b[1] === 0x4b)) {
    println('SUSPECT MIGRATION ' + f + ' bytes ' + b.length + ' head ' + b.slice(0, 8).toString('hex'));
  }
}

const baseline = path.join(root, 'supabase-strength-team-schema.sql');
const bb = fs.readFileSync(baseline);
if (bb.includes(Buffer.from('Jesse'))) println('Jesse in baseline');

fs.writeFileSync(path.join(root, 'scripts/staging-sql/_inspect-result.txt'), log.join('\n'), 'utf8');
