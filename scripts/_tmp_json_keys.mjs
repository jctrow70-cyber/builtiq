import fs from "fs";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const keys = Object.keys(report);
fs.writeFileSync("docs/catalog-overhaul/_tmp_last_keys.txt", keys.join("\n"));
process.exit(10 + keys.length);
