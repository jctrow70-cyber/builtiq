import fs from "fs";
const t = fs.readFileSync(process.argv[2], "utf8");
const needle = process.argv[3];
process.exit(t.indexOf(needle) >= 0 ? 3 : 2);
