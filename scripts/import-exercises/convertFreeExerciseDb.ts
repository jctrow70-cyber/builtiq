#!/usr/bin/env node
/**
 * Convert yuhonas/free-exercise-db JSON → BuildIQ import format.
 * License: The Unlicense (public domain) — https://github.com/yuhonas/free-exercise-db
 *
 * Usage:
 *   npm run import:convert:free-exercise-db
 *   npm run import:convert:free-exercise-db -- --in path/to/exercises.json --out path/to/buildiq-import.json
 */

import fs from 'fs';
import path from 'path';
import { convertFreeExerciseDbRows, type FreeExerciseDbRow } from './sources/freeExerciseDb';

const DEFAULT_IN = 'scripts/import-exercises/data/free-exercise-db/exercises.json';
const DEFAULT_OUT = 'scripts/import-exercises/data/free-exercise-db/buildiq-import.json';

function parseArgs(argv: string[]) {
  let input = DEFAULT_IN;
  let output = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' && argv[i + 1]) input = argv[++i];
    else if (a === '--out' && argv[i + 1]) output = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(`Convert free-exercise-db JSON to BuildIQ import format

Options:
  --in <path>   Source exercises.json (default: ${DEFAULT_IN})
  --out <path>  Output file (default: ${DEFAULT_OUT})
`);
      process.exit(0);
    }
  }
  return { input, output };
}

function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const inPath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(inPath)) {
    console.error(`Error: input file not found: ${inPath}
Download it first:
  mkdir -Force scripts/import-exercises/data/free-exercise-db
  Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json" -OutFile "${DEFAULT_IN.replace(/\//g, '\\')}"
`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inPath, 'utf8')) as FreeExerciseDbRow[];
  if (!Array.isArray(raw)) {
    console.error('Error: input JSON must be an array of exercises.');
    process.exit(1);
  }

  const converted = convertFreeExerciseDbRows(raw);
  const outPath = path.resolve(process.cwd(), output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(converted, null, 2), 'utf8');

  console.log(`Converted ${converted.length} exercises`);
  console.log(`  from: ${inPath}`);
  console.log(`  to:   ${outPath}`);
  console.log(`
Next steps:
  npm run import:exercises:dry -- --file ${output.replace(/\\/g, '/')}
  npm run import:exercises -- --file ${output.replace(/\\/g, '/')}
`);
}

main();
