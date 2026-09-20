/** One-off: parse the master xlsx XML into docs/catalog-overhaul/builtiq-master-catalog.json */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = join(process.cwd(), 'docs/catalog-overhaul/_lib_xml/xl');
const sstXml = readFileSync(join(root, 'sharedStrings.xml'), 'utf8');
const sheetXml = readFileSync(join(root, 'worksheets/sheet1.xml'), 'utf8');

function decodeXml(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1]));
    out.push(texts.join(''));
  }
  return out;
}

function colToIndex(col: string) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const sst = parseSharedStrings(sstXml);
const rows = new Map<number, string[]>();

const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>(?:<v>([^<]*)<\/v>)?<\/c>/g;
let cm: RegExpExecArray | null;
while ((cm = cellRe.exec(sheetXml))) {
  const col = colToIndex(cm[1]);
  const row = Number(cm[2]);
  const attrs = cm[3] || '';
  const raw = cm[4] ?? '';
  const isShared = /\bt="s"/.test(attrs);
  const value = isShared ? sst[Number(raw)] ?? '' : raw;
  if (!rows.has(row)) rows.set(row, []);
  rows.get(row)![col] = value;
}

const header = rows.get(1) || [];
const records = [];
for (const [rowNum, cells] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
  if (rowNum === 1) continue;
  const rec: Record<string, string> = {};
  header.forEach((h, i) => {
    rec[h] = String(cells[i] ?? '').trim();
  });
  if (!rec['Exercise Name'] && !rec.ID) continue;
  records.push(rec);
}

const outPath = join(process.cwd(), 'docs/catalog-overhaul/builtiq-master-library-raw.json');
writeFileSync(outPath, JSON.stringify({ header, count: records.length, records }, null, 2));
console.log(`wrote ${records.length} rows to ${outPath}`);
console.log('movements', [...new Set(records.map((r) => r['Movement Pattern']))].sort());
console.log('categories', [...new Set(records.map((r) => r.Category))].sort());
console.log('equipment', [...new Set(records.map((r) => r['Default Equipment']))].sort());
