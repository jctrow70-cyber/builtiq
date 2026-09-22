import { HOUSEHOLD_MAP_CSV } from './householdExerciseMapData';

export type HouseholdMapRow = {
  logged_name: string;
  current_catalog_id: string;
  new_exercise_id: string;
  new_exercise_name: string;
  match_status: string;
};

const ADD_NAME_TO_ID: Record<string, string> = {
  'Power Clean': '249',
  Windmill: '250',
  'Side Bend': '251',
  'Pull-Up Work': '252',
  'Trunk Rotation': '253',
  'Plate Front Raise': '254',
  Snatch: '255',
  'Clean & Jerk': '256',
  'Hang Clean': '257',
  'Power Snatch': '258',
  'Push Jerk': '259',
  'Split Jerk': '260',
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadMappedRows(): HouseholdMapRow[] {
  const text = HOUSEHOLD_MAP_CSV;
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      rec[h] = (cols[i] || '').trim();
    });
    let newId = rec.new_exercise_id || '';
    if (!newId && rec.match_status === 'add') newId = ADD_NAME_TO_ID[rec.new_exercise_name] || '';
    return {
      logged_name: rec.logged_name || '',
      current_catalog_id: rec.current_catalog_id || '',
      new_exercise_id: newId,
      new_exercise_name: rec.new_exercise_name || '',
      match_status: rec.match_status || '',
    };
  });
}

export function householdRowsToRemap(): HouseholdMapRow[] {
  return loadMappedRows().filter((row) => ['auto', 'approved', 'add'].includes(row.match_status) && row.new_exercise_id);
}

export function householdCatalogIdUseCount(): Map<string, number> {
  const counts = new Map<string, number>();
  loadMappedRows().forEach((row) => {
    if (!row.current_catalog_id) return;
    counts.set(row.current_catalog_id, (counts.get(row.current_catalog_id) || 0) + 1);
  });
  return counts;
}
