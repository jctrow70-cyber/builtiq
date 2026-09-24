import fs from "fs";
const s = fs.readFileSync(process.argv[2], "utf8");
process.exit(Math.min(180, s.length));
