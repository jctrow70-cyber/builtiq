import fs from "fs";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.exit(report[process.argv[3]] === undefined ? 2 : 3);
