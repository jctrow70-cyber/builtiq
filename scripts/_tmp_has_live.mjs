import fs from "fs";
const j = JSON.parse(fs.readFileSync("docs/catalog-overhaul/active-catalog-enrichment-live-generation.json", "utf8"));
process.exit(j[process.argv[2]] === undefined ? 2 : 3);
