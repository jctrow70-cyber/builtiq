import fs from "fs";
const t = fs.readFileSync(process.argv[2], "utf8");
const lines = t.split(/\n/);
process.exit(10 + lines.length);
