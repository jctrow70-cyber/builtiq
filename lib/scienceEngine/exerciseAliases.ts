/** Common S&C names → catalog names. Exact alias keys only — never steal a more specific lift. */
export const EXERCISE_ALIASES: Record<string, string> = {
  'bench press': 'Barbell Bench Press',
  'barbell bench': 'Barbell Bench Press',
  'flat bench': 'Barbell Bench Press',
  'db bench': 'Dumbbell Bench Press',
  'dumbbell bench': 'Dumbbell Bench Press',
  'incline db press': 'Incline Dumbbell Press',
  'incline press': 'Incline Dumbbell Press',
  'ohp': 'Overhead Press',
  'military press': 'Overhead Press',
  'dumbbell overhead press': 'Dumbbell Shoulder Press',
  'db overhead press': 'Dumbbell Shoulder Press',
  'db shoulder press': 'Dumbbell Shoulder Press',
  'barbell row': 'Bent-Over Row',
  'chest-supported row': 'Chest-Supported Row',
  'chest supported row': 'Chest-Supported Row',
  'chest supported db row': 'Chest-Supported Row',
  'db row': 'One-Arm Row',
  'dumbbell row': 'One-Arm Row',
  'cable row': 'Machine Row',
  'seated row': 'Machine Row',
  'seated cable row': 'Machine Row',
  'lat pull down': 'Lat Pulldown',
  'lat pull-down': 'Lat Pulldown',
  'pulldown': 'Lat Pulldown',
  'pull up': 'Pull-Up',
  'pullups': 'Pull-Up',
  'chin up': 'Chin-Up',
  'chinups': 'Chin-Up',
  'deadlift': 'Conventional Deadlift',
  'conv deadlift': 'Conventional Deadlift',
  'rdl': 'Romanian Deadlift',
  'barbell rdl': 'Romanian Deadlift',
  'light db rdl': 'Dumbbell RDL',
  'light dumbbell rdl': 'Dumbbell RDL',
  'db rdl': 'Dumbbell RDL',
  'trap bar dl': 'Trap Bar Deadlift',
  'hex bar deadlift': 'Trap Bar Deadlift',
  'split squat': 'Bulgarian Split Squat',
  'rear foot elevated split squat': 'Bulgarian Split Squat',
  'walking lunges': 'Walking Lunge',
  'goblet squats': 'Goblet Squat',
  'bb squat': 'Back Squat',
  'farmers carry': 'Farmer Carry',
  'farmer carries': 'Farmer Carry',
  'farmer\'s carry': 'Farmer Carry',
  'kb swing': 'Kettlebell Swing',
  'squat jump': 'Vertical Jump',
  'box jump': 'Vertical Jump',
  'mb chest pass': 'Medicine-Ball Chest Pass',
  'med ball chest pass': 'Medicine-Ball Chest Pass',
  'push up': 'Push-Up',
  'push-up + thoracic rotation': 'Push-Up to Toe Touch',
  'push-up to rotation': 'Push-Up to Toe Touch',
  'push up to rotation': 'Push-Up to Toe Touch',
  'band pulldown': 'Band Row',
  'band pull down': 'Band Row',
  'scapular wall slide': 'Scapular Push-Up',
  'wall slide': 'Scapular Push-Up',
};

/** Prefer 260-master names first, then FALLBACK_CATALOG names. */
export const EXERCISE_ALIAS_CANDIDATES: Record<string, string[]> = {
  'barbell row': ['Bent-Over Row', 'Barbell Row'],
  'dumbbell row': ['One-Arm Row', 'Dumbbell Row'],
  'db row': ['One-Arm Row', 'Dumbbell Row'],
  'chest-supported row': ['Chest-Supported Row', 'One-Arm Row', 'Dumbbell Row'],
  'chest supported row': ['Chest-Supported Row', 'One-Arm Row', 'Dumbbell Row'],
  'chest supported db row': ['Chest-Supported Row', 'One-Arm Row', 'Dumbbell Row'],
  'cable row': ['Machine Row', 'Low Row', 'Seated Cable Row'],
  'seated row': ['Machine Row', 'Low Row', 'Seated Cable Row'],
  'seated cable row': ['Machine Row', 'Low Row', 'Seated Cable Row'],
};

export function aliasExerciseName(name: string): string {
  const key = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return EXERCISE_ALIASES[key] || name;
}

export function aliasCandidates(name: string): string[] {
  const key = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (EXERCISE_ALIAS_CANDIDATES[key]) return EXERCISE_ALIAS_CANDIDATES[key];
  const single = EXERCISE_ALIASES[key];
  return single ? [single] : [];
}
