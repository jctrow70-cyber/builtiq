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
};

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return s.trim();
}

function normalizeDays(days: unknown): DayLabel[] {
  if (!Array.isArray(days)) return [];
  return days
    .map((d) => String(d))
    .filter((d): d is DayLabel => (DAY_LABELS as readonly string[]).includes(d))
    .sort((a, b) => DAY_LABELS.indexOf(a) - DAY_LABELS.indexOf(b));
}

function normalizeDayType(value: unknown): DayType | null {
  const s = String(value || '').trim();
  return (VALID_DAY_TYPES as readonly string[]).includes(s) ? (s as DayType) : null;
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
  if (optionsIn.length < 2 || optionsIn.length > 4) {
    return { suggestion: null, error: `Expected 2–4 schedule options, got ${optionsIn.length}` };
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
    const dayTypes: Record<string, DayType> = {};
    for (const d of days) {
      const dt = normalizeDayType(dayTypesIn[d]);
      if (!dt) return { suggestion: null, error: `Option ${id}: invalid day_type for ${d}` };
      dayTypes[d] = dt;
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

  const recommendedId = String(parsed.recommended_option_id || '').trim();
  if (!recommendedId || !optionIds.has(recommendedId)) {
    return { suggestion: null, error: 'recommended_option_id must match an option id' };
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
