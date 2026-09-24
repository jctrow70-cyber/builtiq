const fs = require('fs');
const j = JSON.parse(fs.readFileSync('docs/catalog-overhaul/active-catalog-enrichment-live-generation.json', 'utf8'));
const out = {
  topKeys: Object.keys(j),
  nested: Object.fromEntries(Object.keys(j).map(j) => {
    const v = j[k);
    if (Array.isArray(v)) return [k, 'array[' + v.length + ']'];
    if (v && typeof v === 'object') return [k, Object.keys(v).slice(0, 50)];
    return [k, typeof v];
  }))
};
fs.writeFileSync('.tmp-live-keys.json', JSON.stringify(out, null, 2));
