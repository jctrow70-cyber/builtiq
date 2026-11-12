const fs = require('fs');
const path = require('path');
const dir = path.join('supabase', 'migrations');
const names = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
const included = names.filter((name) => name < '20261102_076');
const excluded = names.filter((name) => name >= '20261102_076');
const outDir = path.join('scripts', 'staging-sql');
fs.mkdirSync(outDir, { recursive: true });
const parts = [];
let current = [];
let currentBytes = 0;
const limit = 450000;
function flush() {
  if (!current.length) return;
  parts.push(current);
  current = [];
  currentBytes = 0;
}
for (const name of included) {
  const body = fs.readFileSync(path.join(dir, name));
  const header = Buffer.from(`\n\n-- ===== ${name} =====\n\n`);
  if (currentBytes > 0 && currentBytes + header.length + body.length > limit) flush();
  current.push(header, body);
  currentBytes += header.length + body.length;
}
flush();
parts.forEach((chunks, index) => {
  const file = path.join(outDir, `part-${String(index + 1).padStart(2, '0')}.sql`);
  fs.writeFileSync(file, Buffer.concat(chunks));
});
const manifest = [
  `included ${included.length}`,
  ...included,
  '',
  `excluded ${excluded.length}`,
  ...excluded,
  '',
  `parts ${parts.length}`,
].join('\n');
fs.writeFileSync(path.join(outDir, 'manifest.txt'), manifest);
console.log(manifest);
