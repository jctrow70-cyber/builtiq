const fs = require('fs');
try {
  const j = JSON.parse(fs.readFileSync('docs/catalog-overhaul/active-catalog-enrichment-live-generation.json', 'utf8'));
  const lines = [];
  function h(k, x) {
    lines.push(String(k) + '=' + ((x === undefined || x === null) ? 'null' : (typeof x === 'object' ? JSON.stringify(x) : String(x))));
  }
  h('topKeys', Object.keys(j));
  for (const k of Object.keys(j)) {
    const v = j[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      h(k + '.nestedKeys', Object.keys(v));
    } else if (Array.isArray(v)) {
      h(k + '.len', v.length);
    } else {
      h(k, v);
    }
  }
  fs.writeFileSync('.tmp-live-struct.txt', lines.join('\n'));
  fs.writeFileSync('.tmp-live-struct-ok.txt', 'OK');
} catch (e) {
  fs.writeFileSync('.tmp-live-struct-err.txt', String(e && e.stack ? e.stack : e));
  process.exit(1);
}
