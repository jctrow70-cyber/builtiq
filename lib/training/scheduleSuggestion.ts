/** BIQ-0015: AI schedule / split recommendations for program setup wizard */

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type DayLabel = (typeof DAY_LABELS)[number];

export const VALID_DAY_TYPES = ['Lower Body', 'Upper Body', 'Full Body', 'Cardio', 'Mobility'] as const;
export type DayType = (typeof VALID_DAY_TYPES)[number];

export type ScheduleOption = {
  id: string;
  label: string;
  description: string;
  days: DayLabel[];
  day_types: Record<string, DayType>;
  includes_cardio: boolean;
  includes_mobility: boolean;
};

export type ScheduleSuggestion = {
  coach_message: string;
  asks_cardio: boolean;
  asks_mobility: boolean;
  options: ScheduleOption[];
  recommended_option_id: string;
  day_emphasis?: Record<string, string>;
  weeks_hint?: number | null;
};

export type ParsedExplicitSchedule = {
  option: ScheduleOption;
  dayEmphasis: Record<string, string>;
  weeksHint: number | null;
};

const SPACED_DAY_LAYOUTS: Record<number, DayLabel[]> = {
  2: ['Tue', 'Fri'],
  3: ['Mon', 'Wed', 'Fri'],
  4: ['Mon', 'Tue', 'Thu', 'Fri'],
  5: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'],
  6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

function pickSpacedDays(count: number): DayLabel[] {
  if (SPACED_DAY_LAYOUTS[count]) return [...SPACED_DAY_LAYOUTS[count]];
  if (count <= DAY_LABELS.length) return DAY_LABELS.slice(0, count);
  return [...SPACED_DAY_LAYOUTS[6]];
}

function parseCountWord(raw: string): number {
  const wordMap: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const key = raw.toLowerCase().trim();
  if (wordMap[key]) return wordMap[key];
  const n = parseInt(key, 10);
  return Number.isFinite(n) ? n : 0;
}

export const PUSH_FULL_BODY_EMPHASIS =
  'Push-focused full body — prioritize chest, shoulders, triceps, and squat/lunge patterns; use push_horizontal and push_vertical movements only (no rows, pulldowns, pull-ups, or hip hinges)';

export const PULL_FULL_BODY_EMPHASIS =
  'Pull-focused full body — prioritize back, lats, biceps, and posterior chain (rows, pulldowns, pull-ups, RDL/hip hinge); minimize chest pressing and triceps-dominant push work';

/** Detect push- or pull-focused full-body intent in goals (not upper/lower split). */
export function detectPushPullFocusFromGoals(goals: string): 'push' | 'pull' | null {
  const text = goals.toLowerCase();
  if (/pull[\s-]*(upper|lower)|push[\s-]*(upper|lower)|lower[\s-]*body[\s-]*(push|pull)/.test(text)) {
    return null;
  }
  const push =
    /(?:full[\s-]?body[\s\S]{0,40}push|push[\s\S]{0,40}full[\s-]?body|push[\s-]?(?:focused|focus|emphasis|dominant|heavy)|focus(?:ed)?\s+on\s+push|push\s+exercises?|push[\s-]?only)/.test(
      text
    );
  const pull =
    /(?:full[\s-]?body[\s\S]{0,40}pull|pull[\s\S]{0,40}full[\s-]?body|pull[\s-]?(?:focused|focus|emphasis|dominant|heavy)|focus(?:ed)?\s+on\s+pull|pull\s+exercises?|pull[\s-]?only)/.test(
      text
    );
  if (push && !pull) return 'push';
  if (pull && !push) return 'pull';
  return null;
}

/** Apply push/pull emphasis to Full Body days from goals text. */
export function buildDayEmphasisFromGoals(
  goals: string,
  days: string[],
  dayTypes: Record<string, string>
): Record<string, string> {
  const focus = detectPushPullFocusFromGoals(goals);
  if (!focus) return {};
  const emphasis = focus === 'push' ? PUSH_FULL_BODY_EMPHASIS : PULL_FULL_BODY_EMPHASIS;
  const out: Record<string, string> = {};
  for (const day of days) {
    if (dayTypes[day] === 'Full Body') out[day] = emphasis;
  }
  return out;
}

/** Merge schedule option emphasis with goal-derived emphasis (option wins when both set). */
export function mergeDayEmphasisFromGoals(
  goals: string,
  days: string[],
  dayTypes: Record<string, string>,
  existing: Record<string, string> = {}
): Record<string, string> {
  const merged = { ...buildDayEmphasisFromGoals(goals, days, dayTypes), ...existing };
  return merged;
}

function detectPushFullBodyFocus(text: string): boolean {
  return detectPushPullFocusFromGoals(text) === 'push';
}

function detectPullFullBodyFocus(text: string): boolean {
  return detectPushPullFocusFromGoals(text) === 'pull';
}

/** When the user describes a specific weekly split in goals text, build it directly. */
export function parseExplicitScheduleFromGoals(goals: string): ParsedExplicitSchedule | null {
  const text = goals.toLowerCase();

  const wantsPullLower =
    /pull[\s-]*(lower|legs?)|lower[\s-]*body[\s-]*pull|pull[\s-]*lower[\s-]*body/.test(text);
  const wantsPullUpper =
    /pull[\s-]*(upper|body)|upper[\s-]*body[\s-]*pull|pull[\s-]*upper[\s-]*body/.test(text);
  const wantsPushLower = /push[\s-]*(lower|legs?)|lower[\s-]*body[\s-]*push/.test(text);
  const wantsPushUpper = /push[\s-]*(upper|body)|upper[\s-]*body[\s-]*push/.test(text);
  const wantsPushFullBody = detectPushFullBodyFocus(text);
  const wantsPullFullBody = detectPullFullBodyFocus(text);

  let fullBodyCount = 0;
  const fullBodyMatch = text.match(/(\d+|one|two|three|four|five|six)\s+full[\s-]?body/);
  if (fullBodyMatch) fullBodyCount = parseCountWord(fullBodyMatch[1]);

  if (fullBodyCount === 0 && (wantsPushFullBody || wantsPullFullBody)) {
    const countMatch = text.match(/(\d+|one|two|three|four|five|six)\s+(?:full[\s-]?body|workout|training|day)/);
    fullBodyCount = countMatch ? parseCountWord(countMatch[1]) : 3;
  }

  const sessions: { type: DayType; emphasis?: string; label: string }[] = [];

  if (wantsPullUpper) {
    sessions.push({
      type: 'Upper Body',
      label: 'Pull upper body',
      emphasis:
        'Pull-focused upper body — prioritize back, lats, rear delts, and biceps; minimize chest pressing',
    });
  } else if (wantsPushUpper) {
    sessions.push({
      type: 'Upper Body',
      label: 'Push upper body',
      emphasis:
        'Push-focused upper body — prioritize chest, shoulders, and triceps; minimize heavy rowing volume',
    });
  }

  if (wantsPullLower) {
    sessions.push({
      type: 'Lower Body',
      label: 'Pull lower body',
      emphasis:
        'Pull-focused lower body — prioritize hamstrings, glutes, and posterior chain (RDL, hip hinge, ham curl)',
    });
  } else if (wantsPushLower) {
    sessions.push({
      type: 'Lower Body',
      label: 'Push lower body',
      emphasis: 'Push-focused lower body — prioritize quads, glutes, and squat/lunge patterns',
    });
  }

  for (let i = 0; i < fullBodyCount; i++) {
    if (wantsPushFullBody && !wantsPullFullBody) {
      sessions.push({
        type: 'Full Body',
        label: 'Push-focused full body',
        emphasis: PUSH_FULL_BODY_EMPHASIS,
      });
    } else if (wantsPullFullBody && !wantsPushFullBody) {
      sessions.push({
        type: 'Full Body',
        label: 'Pull-focused full body',
        emphasis: PULL_FULL_BODY_EMPHASIS,
      });
    } else {
      sessions.push({ type: 'Full Body', label: 'Full body' });
    }
  }

  if (sessions.length < 2) return null;
  if (
    !wantsPullLower &&
    !wantsPullUpper &&
    !wantsPushLower &&
    !wantsPushUpper &&
    !wantsPushFullBody &&
    !wantsPullFullBody &&
    fullBodyCount === 0
  ) {
    return null;
  }

  const days = pickSpacedDays(sessions.length);
  const day_types: Record<string, DayType> = {};
  const dayEmphasis: Record<string, string> = {};
  sessions.forEach((session, index) => {
    const day = days[index];
    day_types[day] = session.type;
    if (session.emphasis) dayEmphasis[day] = session.emphasis;
  });

  const weeksMatch = text.match(/(\d+)\s+weeks?/);
  const weeksHint = weeksMatch ? Math.max(1, Math.min(12, parseInt(weeksMatch[1], 10))) : null;

  const summary = sessions.map((s) => s.label).join(' · ');

  return {
    option: {
      id: 'opt_requested',
      label: `Your requested split (${sessions.length}-day)`,
      description: `From your goals: ${summary}.`,
      days,
      day_types,
      includes_cardio: false,
      includes_mobility: false,
    },
    dayEmphasis,
    weeksHint,
  };
}

export function mergeExplicitScheduleOption(
  suggestion: ScheduleSuggestion,
  explicit: ParsedExplicitSchedule | null
): ScheduleSuggestion {
  if (!explicit) return suggestion;
  const options = suggestion.options.filter((o) => o.id !== explicit.option.id);
  return {
    ...suggestion,
    options: [explicit.option, ...options].slice(0, 4),
    recommended_option_id: explicit.option.id,
    coach_message: `We matched your description with "${explicit.option.label}" (${explicit.option.description}). Pick it below or choose another split.`,
    day_emphasis: explicit.dayEmphasis,
    weeks_hint: explicit.weeksHint,
  };
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return s.trim();
}

function normalizeDayLabel(value: unknown): DayLabel | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if ((DAY_LABELS as readonly string[]).includes(raw)) return raw as DayLabel;
  const key = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  const aliases: Record<string, DayLabel> = {
    mon: 'Mon',
    monday: 'Mon',
    tue: 'Tue',
    tues: 'Tue',
    tuesday: 'Tue',
    wed: 'Wed',
    weds: 'Wed',
    wednesday: 'Wed',
    thu: 'Thu',
    thur: 'Thu',
    thurs: 'Thu',
    thursday: 'Thu',
    fri: 'Fri',
    friday: 'Fri',
    sat: 'Sat',
    saturday: 'Sat',
    sun: 'Sun',
    sunday: 'Sun',
  };
  return aliases[key] || null;
}

function normalizeDays(days: unknown): DayLabel[] {
  if (!Array.isArray(days)) return [];
  const seen = new Set<DayLabel>();
  const out: DayLabel[] = [];
  for (const entry of days) {
    const label = normalizeDayLabel(entry);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.sort((a, b) => DAY_LABELS.indexOf(a) - DAY_LABELS.indexOf(b));
}

const DAY_TYPE_ALIASES: Record<string, DayType> = {
  'lower body': 'Lower Body',
  lower: 'Lower Body',
  legs: 'Lower Body',
  'leg day': 'Lower Body',
  'upper body': 'Upper Body',
  upper: 'Upper Body',
  push: 'Upper Body',
  pull: 'Upper Body',
  'full body': 'Full Body',
  full: 'Full Body',
  'total body': 'Full Body',
  cardio: 'Cardio',
  conditioning: 'Cardio',
  endurance: 'Cardio',
  run: 'Cardio',
  mobility: 'Mobility',
  recovery: 'Mobility',
  stretch: 'Mobility',
  stretching: 'Mobility',
};

function normalizeDayType(value: unknown): DayType | null {
  const s = String(value || '').trim();
  if (!s) return null;
  if ((VALID_DAY_TYPES as readonly string[]).includes(s)) return s as DayType;
  const key = s.toLowerCase().replace(/\s+/g, ' ');
  if (DAY_TYPE_ALIASES[key]) return DAY_TYPE_ALIASES[key];
  for (const valid of VALID_DAY_TYPES) {
    if (valid.toLowerCase() === key) return valid;
  }
  if (/lower|leg|squat|deadlift|glute|hamstring|quad/.test(key)) return 'Lower Body';
  if (/upper|push|pull|chest|back|shoulder|arm/.test(key)) return 'Upper Body';
  if (/full|total/.test(key)) return 'Full Body';
  if (/cardio|condition|run|bike|walk|endurance/.test(key)) return 'Cardio';
  if (/mobil|stretch|recover|yoga|flex/.test(key)) return 'Mobility';
  return null;
}

function normalizeDayTypesMap(
  days: DayLabel[],
  dayTypesIn: Record<string, unknown>,
): Record<string, DayType> | null {
  const byCanonical: Record<string, DayType> = {};
  for (const [rawKey, rawType] of Object.entries(dayTypesIn || {})) {
    const day = normalizeDayLabel(rawKey);
    const type = normalizeDayType(rawType);
    if (day && type) byCanonical[day] = type;
  }

  const dayTypes: Record<string, DayType> = {};
  for (const day of days) {
    if (byCanonical[day]) {
      dayTypes[day] = byCanonical[day];
      continue;
    }
    return null;
  }
  return dayTypes;
}

export function buildScheduleSuggestionPrompt(
  goals: string,
  profile: any,
  includeCardio: boolean | null = null,
  includeMobility: boolean | null = null,
  availableEquipment: string[] = []
): { system: string; user: string } {
  const cardioPref =
    includeCardio === true
      ? 'User wants cardio days included — offer at least one option with dedicated Cardio day_types.'
      : includeCardio === false
        ? 'User does NOT want dedicated cardio days — strength splits only (no Cardio day_types).'
        : 'User has not decided on cardio — include a mix: some options without cardio and at least one with Cardio days when goals benefit (endurance, fat loss, general athleticism). Set asks_cardio true when offering both styles.';

  const mobilityPref =
    includeMobility === true
      ? 'User wants a mobility/recovery day included — offer at least one option with a dedicated Mobility day_type (e.g. Sun Mobility).'
      : includeMobility === false
        ? 'User does NOT want a dedicated mobility day — no Mobility day_types.'
        : 'User has not decided on mobility days — include a mix when goals imply high training load, rotational sport (baseball, golf), or recovery needs. Set asks_mobility true when offering both styles.';

  const system = `You are BuildIQ Health's training schedule coach. Recommend weekly workout splits tailored to the user's goals. Output ONLY valid JSON — no markdown.

Rules:
0. If goals explicitly describe workout types (e.g. pull upper, pull lower, push upper, push-focused full body, N full-body days, or days per week), you MUST include an option with id "opt_requested" that matches their description exactly (correct count of each day type). Set recommended_option_id to "opt_requested" unless their request is unsafe or impossible.
1. Provide 2–4 schedule options with distinct training frequencies (e.g. 3-day, 4-day, 5-day).
2. Tailor splits to goals: baseball/throwing → rotation + power upper/lower; hypertrophy → push/pull/legs; strength → heavy compound focus; fat loss/endurance → consider cardio days; high-frequency training → consider Mobility recovery day.
3. Valid day_labels: Mon, Tue, Wed, Thu, Fri, Sat, Sun — use 3–5 training days per option, realistic weekly spacing (avoid back-to-back same muscle group when possible).
4. Valid day_types per day: "Lower Body", "Upper Body", "Full Body", "Cardio", "Mobility" — every training day in "days" must have a matching entry in day_types.
5. Option ids: opt_a, opt_b, opt_c, opt_d (use sequential ids for each option).
6. recommended_option_id must match one option id — pick the best default for their goals and experience.
7. coach_message: 2–4 friendly sentences summarizing how the splits fit their goals and what to consider when picking.
8. asks_cardio: true if user should consider adding cardio days (when includeCardio is null and goals may benefit).
9. asks_mobility: true if user should consider adding a mobility/recovery day (when includeMobility is null and goals may benefit).
10. includes_cardio on each option: true if any day_types value is "Cardio".
11. includes_mobility on each option: true if any day_types value is "Mobility".
12. Frame as general fitness guidance — not medical advice.

JSON schema:
{
  "coach_message": "string",
  "asks_cardio": boolean,
  "asks_mobility": boolean,
  "options": [
    {
      "id": "opt_a",
      "label": "3-day Athletic (Mon/Wed/Fri)",
      "description": "Why this fits their goals",
      "days": ["Mon","Wed","Fri"],
      "day_types": { "Mon": "Upper Body", "Wed": "Lower Body", "Fri": "Full Body" },
      "includes_cardio": false,
      "includes_mobility": false
    }
  ],
  "recommended_option_id": "opt_a"
}`;

  const user = JSON.stringify(
    {
      goals: goals.trim(),
      cardio_preference: cardioPref,
      mobility_preference: mobilityPref,
      available_equipment: availableEquipment.length ? availableEquipment : null,
      athlete_profile: {
        experience_level: profile?.experience_level || 'beginner',
        primary_goal: profile?.primary_goal || 'general_health',
        sex: profile?.sex || null,
      },
    },
    null,
    0
  );

  return { system, user };
}

export function parseScheduleSuggestion(raw: string): { suggestion: ScheduleSuggestion | null; error: string | null } {
  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch {
    return { suggestion: null, error: 'AI response was not valid JSON' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { suggestion: null, error: 'Schedule suggestion must be a JSON object' };
  }

  const coachMessage = String(parsed.coach_message || '').trim();
  if (!coachMessage) return { suggestion: null, error: 'Missing coach_message' };

  const asksCardio = Boolean(parsed.asks_cardio);
  const asksMobility = Boolean(parsed.asks_mobility);
  const optionsIn = Array.isArray(parsed.options) ? parsed.options : [];
  if (optionsIn.length < 1 || optionsIn.length > 4) {
    return { suggestion: null, error: `Expected 1–4 schedule options, got ${optionsIn.length}` };
  }

  const options: ScheduleOption[] = [];
  const optionIds = new Set<string>();

  for (const row of optionsIn) {
    const id = String(row?.id || '').trim();
    const label = String(row?.label || '').trim();
    const description = String(row?.description || '').trim();
    if (!id || !label) return { suggestion: null, error: 'Each option needs id and label' };
    if (optionIds.has(id)) return { suggestion: null, error: `Duplicate option id: ${id}` };
    optionIds.add(id);

    const days = normalizeDays(row?.days);
    if (days.length < 2 || days.length > 6) {
      return { suggestion: null, error: `Option ${id} must have 2–6 training days` };
    }

    const dayTypesIn = row?.day_types && typeof row.day_types === 'object' ? row.day_types : {};
    const dayTypes = normalizeDayTypesMap(days, dayTypesIn as Record<string, unknown>);
    if (!dayTypes) {
      return { suggestion: null, error: `Option ${id}: could not map day_types for ${days.join(', ')}` };
    }

    const includesCardio = Object.values(dayTypes).some((t) => t === 'Cardio');
    const includesMobility = Object.values(dayTypes).some((t) => t === 'Mobility');

    options.push({
      id,
      label,
      description: description || label,
      days,
      day_types: dayTypes,
      includes_cardio: includesCardio,
      includes_mobility: includesMobility,
    });
  }

  let recommendedId = String(parsed.recommended_option_id || '').trim();
  if (!recommendedId || !optionIds.has(recommendedId)) {
    recommendedId = options[0]?.id || '';
  }
  if (!recommendedId) {
    return { suggestion: null, error: 'No valid schedule options returned' };
  }

  return {
    suggestion: {
      coach_message: coachMessage,
      asks_cardio: asksCardio,
      asks_mobility: asksMobility,
      options,
      recommended_option_id: recommendedId,
    },
    error: null,
  };
}
