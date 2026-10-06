const fs = require('fs');
const s = fs.readFileSync('docs/catalog-overhaul/_prod-page.js', 'utf8');
const keys = ['?90:', '?90,', ':"strength"', '==="strength"', '==="cardio"', 'rowing', 'rower', 'Rear Lunge', 'Smith Machine', 'openAddPanel'];
let out = 'len=' + s.length + '\n';
keys.forEach((k) => {
  out += k + '=' + s.includes(k) + ' idx=' + s.indexOf(k) + '\n';
});
let idx = 0;
let n = 0;
while ((idx = s.indexOf('-80', idx)) !== -1 && n < 8) {
  out += '\n--- -80 at ' + idx + ' ---\n' + s.slice(Math.max(0, idx - 120), idx + 140) + '\n';
  idx += 3;
  n += 1;
}
idx = s.indexOf('?90');
out += '\n--- ?90 at ' + idx + ' ---\n' + (idx >= 0 ? s.slice(Math.max(0, idx - 120), idx + 140) : '') + '\n';
fs.writeFileSync('docs/catalog-overhaul/_prod-snip.txt', out);
