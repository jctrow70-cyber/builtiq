import fs from "fs";
const j = JSON.parse(fs.readFileSync("docs/catalog-overhaul/active-catalog-enrichment-live-generation.json", "utf8"));
const v = j[process.argv[2]];
const n = Number(process.argv[3]);
process.exit(v === n ? 3 : 2);
