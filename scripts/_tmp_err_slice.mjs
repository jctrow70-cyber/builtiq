import fs from "fs";
const err = fs.readFileSync("docs/catalog-overhaul/_tmp_last_error.txt", "utf8");
const start = Number(process.argv[2] || 0);
const slice = err.slice(start, start + 40);
fs.writeFileSync("docs/catalog-overhaul/_tmp_err_slice.txt", slice);
process.exit(slice.length);
