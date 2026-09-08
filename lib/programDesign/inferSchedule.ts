export const SCHEDULE_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type ScheduleDayLabel = (typeof SCHEDULE_DAY_LABELS)[number];

export type InferredSchedule = {
  days: ScheduleDayLabel[];
  dayTypes: Record<string, string>;
  named: boolean;
};

const DAY_ALIASES: Array<{ day: ScheduleDayLabel; pattern: RegExp }> = [
  { day: 'Mon', pattern: /\b(mondays?|mon)\b/gi },
  { day: 'Tue', pattern: /\b(tuesdays?|tues|tue)\b/gi },
  { day: 'Wed', pattern: /\b(wednesdays?|weds|wed)\b/gi },
  { day: 'Thu', pattern: /\b(thursdays?|thurs|thur|thu)\b/gi },
  { day: 'Fri', pattern: /\b(fridays?|fri)\b/gi },
  { day: 'Sat', pattern: /\b(saturdays?|sat)\b/gi },
  { day: 'Sun', pattern: /\b(sundays?|sun)\b/gi },
];

function sortDays(days: ScheduleDayLabel[]): ScheduleDayLabel[] {
  return [...days].sort((a, b) => SCHEDULE_DAY_LABELS.indexOf(a) - SCHEDULE_DAY_LABELS.indexOf(b));
}

export function extractNamedDaysFromText(text: string): ScheduleDayLabel[] {
  const t = String(text || '');
  if (/\bm\s*[\/,]\s*w\s*[\/,]\s*f\b/i.test(t) || /\bmwf\b/i.test(t)) {
    return ['Mon', 'Wed', 'Fri'];
  }

  const seen = new Set<ScheduleDayLabel>();
  const hits: { index: number; day: ScheduleDayLabel }[] = [];
  for (const { day, pattern } of DAY_ALIASES) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(t)) !== null) {
      hits.push({ index: match.index, day });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const out: ScheduleDayLabel[] = [];
  for (const hit of hits) {
    if (seen.has(hit.day)) continue;
    seen.add(hit.day);
    out.push(hit.day);
  }
  return sortDays(out);
}

function inferWorkoutKind(text: string): 'full_body' | 'upper_lower' | 'ppl' {
  const t = text.toLowerCase();
  if (/push.?pull.?leg|ppl/.test(t)) return 'ppl';
  if (/upper.?lower|upper body|lower body/.test(t) && !/full body|full-body|total body/.test(t)) {
    return 'upper_lower';
  }
  return 'full_body';
}

function typesForDays(days: ScheduleDayLabel[], kind: ReturnType<typeof inferWorkoutKind>): Record<string, string> {
  const dayTypes: Record<string, string> = {};
  if (kind === 'ppl') {
    const cycle = ['Push', 'Pull', 'Legs'];
    days.forEach((day, i) => {
      dayTypes[day] = cycle[i % cycle.length];
    });
    return dayTypes;
  }
  if (kind === 'upper_lower') {
    days.forEach((day, i) => {
      dayTypes[day] = i % 2 === 0 ? 'Upper Body' : 'Lower Body';
    });
    return dayTypes;
  }
  days.forEach((day) => {
    dayTypes[day] = 'Full Body';
  });
  return dayTypes;
}

/** Named weekdays in the prompt always win over full-body / 3-day templates. */
export function inferScheduleFromPrompt(text: string): InferredSchedule {
  const namedDays = extractNamedDaysFromText(text);
  const kind = inferWorkoutKind(text);
  const t = String(text || '').toLowerCase();

  if (namedDays.length) {
    return {
      days: namedDays,
      dayTypes: typesForDays(namedDays, kind),
      named: true,
    };
  }

  if (/5.?day|push.?pull.?leg|ppl/.test(t)) {
    const days: ScheduleDayLabel[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    return { days, dayTypes: typesForDays(days, 'ppl'), named: false };
  }
  if (/4.?day|upper.?lower/.test(t)) {
    const days: ScheduleDayLabel[] = ['Mon', 'Tue', 'Thu', 'Fri'];
    return { days, dayTypes: typesForDays(days, 'upper_lower'), named: false };
  }
  if (/3.?day|full body|full-body|total body|m\/w\/f/.test(t)) {
    const days: ScheduleDayLabel[] = ['Mon', 'Wed', 'Fri'];
    return { days, dayTypes: typesForDays(days, 'full_body'), named: false };
  }

  const days: ScheduleDayLabel[] = ['Mon', 'Tue', 'Thu', 'Fri'];
  return { days, dayTypes: typesForDays(days, 'upper_lower'), named: false };
}

export function assertInferScheduleExamples() {
  const wedFri = inferScheduleFromPrompt('I want to just do a full body wednesday and friday of this week');
  if (wedFri.days.join(',') !== 'Wed,Fri') {
    throw new Error(`Expected Wed,Fri — got ${wedFri.days.join(',')}`);
  }
  if (wedFri.days.includes('Mon')) throw new Error('Should not add Monday when Wed and Fri were named');
  if (wedFri.dayTypes.Wed !== 'Full Body' || wedFri.dayTypes.Fri !== 'Full Body') {
    throw new Error('Named full-body days should stay Full Body');
  }

  const mwf = inferScheduleFromPrompt('full body 3 days a week');
  if (mwf.days.join(',') !== 'Mon,Wed,Fri') {
    throw new Error(`Default full-body should be Mon/Wed/Fri — got ${mwf.days.join(',')}`);
  }

  const satOnly = inferScheduleFromPrompt('full body Saturday only');
  if (satOnly.days.join(',') !== 'Sat') throw new Error(`Expected Sat — got ${satOnly.days.join(',')}`);
}
