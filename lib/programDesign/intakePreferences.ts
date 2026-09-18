import { SCHEDULE_DAY_LABELS, type ScheduleDayLabel } from './inferSchedule';

export type IntakeGoal =
  | 'hypertrophy'
  | 'strength'
  | 'fat_loss_support'
  | 'general_fitness'
  | 'athletic_performance'
  | 'muscular_endurance'
  | 'mobility'
  | 'ai_recommend';

export type IntakeSplit =
  | 'full_body'
  | 'upper_lower'
  | 'ppl'
  | 'body_part'
  | 'athletic'
  | 'hybrid'
  | 'ai_recommend';

export type IntakeSupersets = 'minimal' | 'sometimes' | 'frequently' | 'ai_decide';
export type IntakeVariety = 'consistent' | 'balanced' | 'high' | 'ai_decide';
export type IntakeExperience = 'beginner' | 'intermediate' | 'advanced' | 'not_sure';
export type IntakeFeel =
  | 'traditional_strength'
  | 'athletic'
  | 'muscle_building'
  | 'fast_paced'
  | 'balanced'
  | 'low_impact'
  | 'challenging';

export type IntakeLimitation =
  | 'avoid_high_impact'
  | 'avoid_overhead'
  | 'avoid_deep_knee'
  | 'avoid_barbell_squats'
  | 'avoid_deadlifts';

export type IntakeDayAddon = 'yes' | 'no' | 'ai_decide';

export type ProgramIntake = {
  primaryGoal: IntakeGoal;
  trainingDaysPerWeek: number | 'ai_recommend';
  preferredDays: ScheduleDayLabel[];
  sessionMinutes: number;
  trainingSplit: IntakeSplit;
  experienceLevel: IntakeExperience;
  equipment: string[];
  priorityAreas: string[];
  supersetPreference: IntakeSupersets;
  varietyPreference: IntakeVariety;
  trainingFeel: IntakeFeel[];
  limitations: IntakeLimitation[];
  includeCardioDay: IntakeDayAddon;
  includeMobilityDay: IntakeDayAddon;
  notes: string;
};

export const INTAKE_GOALS: { id: IntakeGoal; label: string }[] = [
  { id: 'hypertrophy', label: 'Build Muscle' },
  { id: 'strength', label: 'Get Stronger' },
  { id: 'fat_loss_support', label: 'Lose Fat' },
  { id: 'general_fitness', label: 'General Fitness' },
  { id: 'athletic_performance', label: 'Athletic Performance' },
  { id: 'muscular_endurance', label: 'Improve Endurance' },
  { id: 'mobility', label: 'Mobility / Movement Quality' },
  { id: 'ai_recommend', label: 'Let BuildIQ Recommend' },
];

export const INTAKE_SPLITS: { id: IntakeSplit; label: string }[] = [
  { id: 'full_body', label: 'Full Body' },
  { id: 'upper_lower', label: 'Upper / Lower' },
  { id: 'ppl', label: 'Push / Pull / Legs' },
  { id: 'body_part', label: 'Body Part Split' },
  { id: 'athletic', label: 'Athletic / Performance' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'ai_recommend', label: 'Let BuildIQ Decide' },
];

export const INTAKE_DURATION_OPTIONS = [30, 45, 60, 75, 90];

export const INTAKE_PRIORITY_AREAS = [
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Conditioning',
  'Mobility',
];

export const INTAKE_FEEL_OPTIONS: { id: IntakeFeel; label: string }[] = [
  { id: 'traditional_strength', label: 'Traditional Strength' },
  { id: 'athletic', label: 'Athletic' },
  { id: 'muscle_building', label: 'Muscle-Building' },
  { id: 'fast_paced', label: 'Fast-Paced' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'low_impact', label: 'Low Impact' },
  { id: 'challenging', label: 'Challenging' },
];

export const INTAKE_LIMITATIONS: { id: IntakeLimitation; label: string }[] = [
  { id: 'avoid_high_impact', label: 'Avoid High Impact' },
  { id: 'avoid_overhead', label: 'Avoid Overhead Pressing' },
  { id: 'avoid_deep_knee', label: 'Avoid Deep Knee Flexion' },
  { id: 'avoid_barbell_squats', label: 'Avoid Barbell Squats' },
  { id: 'avoid_deadlifts', label: 'Avoid Deadlifts' },
];

export const DEFAULT_DAYS_BY_FREQUENCY: Record<number, ScheduleDayLabel[]> = {
  2: ['Mon', 'Thu'],
  3: ['Mon', 'Wed', 'Fri'],
  4: ['Mon', 'Tue', 'Thu', 'Fri'],
  5: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  7: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

export function defaultProgramIntake(): ProgramIntake {
  return {
    primaryGoal: 'hypertrophy',
    trainingDaysPerWeek: 3,
    preferredDays: ['Mon', 'Wed', 'Fri'],
    sessionMinutes: 60,
    trainingSplit: 'full_body',
    experienceLevel: 'intermediate',
    equipment: ['full_gym'],
    priorityAreas: [],
    supersetPreference: 'sometimes',
    varietyPreference: 'balanced',
    trainingFeel: ['balanced'],
    limitations: [],
    includeCardioDay: 'ai_decide',
    includeMobilityDay: 'ai_decide',
    notes: '',
  };
}

function parseDayAddon(raw: unknown): IntakeDayAddon {
  const v = String(raw || '').toLowerCase().trim();
  if (v === 'yes' || v === 'true' || v === '1') return 'yes';
  if (v === 'no' || v === 'false' || v === '0') return 'no';
  return 'ai_decide';
}

export function intakeLooksSaved(intake: ProgramIntake): boolean {
  return Boolean(intake.preferredDays.length && intake.sessionMinutes && intake.primaryGoal);
}

export function goalLabel(id: IntakeGoal): string {
  return INTAKE_GOALS.find((g) => g.id === id)?.label || id;
}

export function splitLabel(id: IntakeSplit): string {
  return INTAKE_SPLITS.find((s) => s.id === id)?.label || id;
}

export function supersetLabel(id: IntakeSupersets): string {
  if (id === 'minimal') return 'Minimal';
  if (id === 'frequently') return 'Frequently';
  if (id === 'ai_decide') return 'Let BuildIQ Decide';
  return 'Sometimes';
}

export function varietyLabel(id: IntakeVariety): string {
  if (id === 'consistent') return 'Consistent';
  if (id === 'high') return 'High Variety';
  if (id === 'ai_decide') return 'Let BuildIQ Decide';
  return 'Balanced';
}

export function experienceLabel(id: IntakeExperience): string {
  if (id === 'beginner') return 'Beginner';
  if (id === 'advanced') return 'Advanced';
  if (id === 'not_sure') return 'Not Sure';
  return 'Intermediate';
}

export function resolveExperience(id: IntakeExperience): 'beginner' | 'intermediate' | 'advanced' {
  if (id === 'not_sure') return 'intermediate';
  return id;
}

export function resolveGoal(id: IntakeGoal): string {
  if (id === 'mobility' || id === 'ai_recommend') return 'general_fitness';
  return id;
}

export function daysForIntake(intake: ProgramIntake): ScheduleDayLabel[] {
  const selected = intake.preferredDays.filter((d) => (SCHEDULE_DAY_LABELS as readonly string[]).includes(d));
  if (selected.length) return [...selected].sort((a, b) => SCHEDULE_DAY_LABELS.indexOf(a) - SCHEDULE_DAY_LABELS.indexOf(b));
  const n = intake.trainingDaysPerWeek === 'ai_recommend' ? 3 : Number(intake.trainingDaysPerWeek) || 3;
  return DEFAULT_DAYS_BY_FREQUENCY[Math.max(2, Math.min(7, n))] || DEFAULT_DAYS_BY_FREQUENCY[3];
}

export function dayTypesForIntake(intake: ProgramIntake, days: ScheduleDayLabel[]): Record<string, string> {
  const split = intake.trainingSplit;
  const dayTypes: Record<string, string> = {};
  if (split === 'upper_lower' || (split === 'hybrid' && days.length >= 4)) {
    days.forEach((day, i) => {
      dayTypes[day] = i % 2 === 0 ? 'Upper Body' : 'Lower Body';
    });
    return dayTypes;
  }
  if (split === 'ppl') {
    const cycle = ['Push', 'Pull', 'Legs'];
    days.forEach((day, i) => {
      dayTypes[day] = cycle[i % cycle.length];
    });
    return dayTypes;
  }
  if (split === 'body_part') {
    const cycle = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs'];
    days.forEach((day, i) => {
      dayTypes[day] = cycle[i % cycle.length];
    });
    return dayTypes;
  }
  days.forEach((day) => {
    dayTypes[day] = 'Full Body';
  });
  return dayTypes;
}

export function dayAddonLabel(id: IntakeDayAddon): string {
  if (id === 'yes') return 'Yes';
  if (id === 'no') return 'No';
  return 'Let BuildIQ Decide';
}

export function shouldRecommendCardioDay(intake: ProgramIntake): boolean {
  if (intake.primaryGoal === 'fat_loss_support' || intake.primaryGoal === 'muscular_endurance' || intake.primaryGoal === 'athletic_performance') {
    return true;
  }
  if (intake.priorityAreas.includes('Conditioning')) return true;
  if (intake.trainingFeel.includes('athletic') || intake.trainingFeel.includes('fast_paced')) return true;
  return false;
}

export function shouldRecommendMobilityDay(intake: ProgramIntake): boolean {
  if (intake.primaryGoal === 'mobility') return true;
  if (intake.priorityAreas.includes('Mobility')) return true;
  return daysForIntake(intake).length >= 5;
}

export function resolveDayAddon(pref: IntakeDayAddon, recommend: boolean): boolean {
  if (pref === 'yes') return true;
  if (pref === 'no') return false;
  return recommend;
}

function pickAddonDay(used: Set<string>, liftDays: ScheduleDayLabel[]): ScheduleDayLabel | null {
  const free = SCHEDULE_DAY_LABELS.find((day) => !used.has(day));
  if (free) return free;
  if (liftDays.length >= 7) return liftDays[liftDays.length - 1];
  return null;
}

export function extraDaysForIntake(intake: ProgramIntake, liftDays: ScheduleDayLabel[]): { day: ScheduleDayLabel; type: 'Cardio' | 'Mobility' }[] {
  const extras: { day: ScheduleDayLabel; type: 'Cardio' | 'Mobility' }[] = [];
  const used = new Set<string>(liftDays);
  if (resolveDayAddon(intake.includeCardioDay, shouldRecommendCardioDay(intake))) {
    const day = pickAddonDay(used, liftDays);
    if (day) {
      used.add(day);
      extras.push({ day, type: 'Cardio' });
    }
  }
  if (resolveDayAddon(intake.includeMobilityDay, shouldRecommendMobilityDay(intake))) {
    const remainingLift = liftDays.filter((d) => extras.every((e) => e.day !== d));
    const day = pickAddonDay(used, remainingLift.length ? remainingLift : liftDays);
    if (day) {
      used.add(day);
      extras.push({ day, type: 'Mobility' });
    }
  }
  return extras;
}

export function scheduleFromIntake(intake: ProgramIntake): { days: ScheduleDayLabel[]; dayTypes: Record<string, string> } {
  const liftDays = daysForIntake(intake);
  const dayTypes = intake.trainingSplit === 'ai_recommend' ? ({} as Record<string, string>) : dayTypesForIntake(intake, liftDays);
  const extras = extraDaysForIntake(intake, liftDays);
  const days = [...liftDays];
  extras.forEach(({ day, type }) => {
    if (!days.includes(day)) days.push(day);
    dayTypes[day] = type;
  });
  days.sort((a, b) => SCHEDULE_DAY_LABELS.indexOf(a) - SCHEDULE_DAY_LABELS.indexOf(b));
  return { days, dayTypes };
}

const LIMITATION_EXERCISES: Record<IntakeLimitation, string[]> = {
  avoid_high_impact: [],
  avoid_overhead: ['Overhead Press', 'Dumbbell Shoulder Press'],
  avoid_deep_knee: [],
  avoid_barbell_squats: ['Back Squat', 'Front Squat'],
  avoid_deadlifts: ['Conventional Deadlift', 'Trap Bar Deadlift'],
};

export function limitationExclusions(ids: unknown): string[] {
  const list = Array.isArray(ids) ? ids.map(String) : [];
  return list.flatMap((id) => LIMITATION_EXERCISES[id as IntakeLimitation] || []);
}

export function excludedExercisesFromIntake(intake: ProgramIntake): string[] {
  return limitationExclusions(intake.limitations);
}

export function limitationNotesFromIds(ids: unknown): string[] {
  const list = Array.isArray(ids) ? ids.map(String) : [];
  return limitationNotes({ limitations: list } as ProgramIntake);
}

export function limitationNotes(intake: ProgramIntake): string[] {
  const notes: string[] = [];
  if (intake.limitations.includes('avoid_high_impact')) notes.push('Avoid high-impact plyometrics unless the user asks.');
  if (intake.limitations.includes('avoid_deep_knee')) notes.push('Avoid deep knee flexion and high-range split squats.');
  if (intake.limitations.includes('avoid_overhead')) notes.push('Avoid overhead pressing.');
  return notes;
}

export function buildIntakeNarrative(intake: ProgramIntake): string {
  const days = daysForIntake(intake);
  const parts = [
    `Goal: ${goalLabel(intake.primaryGoal)}.`,
    `Train ${days.length} days/week (${days.join(', ')}).`,
    `${intake.sessionMinutes}-minute sessions.`,
    `Split: ${splitLabel(intake.trainingSplit)}.`,
    `Experience: ${experienceLabel(intake.experienceLevel)}.`,
    `Supersets: ${supersetLabel(intake.supersetPreference)}.`,
    `Variety: ${varietyLabel(intake.varietyPreference)}.`,
  ];
  if (intake.priorityAreas.length) parts.push(`Prioritize: ${intake.priorityAreas.join(', ')}.`);
  if (intake.trainingFeel.length) parts.push(`Feel: ${intake.trainingFeel.map((f) => INTAKE_FEEL_OPTIONS.find((o) => o.id === f)?.label || f).join(', ')}.`);
  if (resolveDayAddon(intake.includeCardioDay, shouldRecommendCardioDay(intake))) parts.push('Include a dedicated cardio day.');
  if (resolveDayAddon(intake.includeMobilityDay, shouldRecommendMobilityDay(intake))) parts.push('Include a dedicated mobility / recovery day.');
  if (intake.notes.trim()) parts.push(intake.notes.trim());
  return parts.join(' ');
}

export function intakeFromProfileRow(row: any, profile?: any): ProgramIntake {
  const base = defaultProgramIntake();
  if (!row && !profile) return base;
  const goal = String(row?.primary_goal || profile?.primary_goal || base.primaryGoal);
  const mappedGoal = (INTAKE_GOALS.some((g) => g.id === goal) ? goal : goal === 'muscle' ? 'hypertrophy' : goal === 'fat_loss' ? 'fat_loss_support' : goal === 'general_health' ? 'general_fitness' : base.primaryGoal) as IntakeGoal;
  const days = Array.isArray(row?.preferred_training_days)
    ? row.preferred_training_days.map(String).filter((d: string) => (SCHEDULE_DAY_LABELS as readonly string[]).includes(d))
    : [];
  const freq = Number(row?.training_days_per_week) || days.length || 3;
  const experienceRaw = String(row?.experience_level || profile?.experience_level || 'intermediate');
  const experience: IntakeExperience =
    experienceRaw === 'beginner' || experienceRaw === 'advanced' || experienceRaw === 'not_sure' ? experienceRaw : 'intermediate';
  const equipment = Array.isArray(row?.available_equipment)
    ? row.available_equipment.map(String)
    : Array.isArray(profile?.available_equipment)
      ? profile.available_equipment.map(String)
      : ['full_gym'];
  const feel = Array.isArray(row?.training_feel) ? row.training_feel.map(String) : row?.training_style_preference ? [String(row.training_style_preference)] : ['balanced'];
  return {
    primaryGoal: mappedGoal,
    trainingDaysPerWeek: freq,
    preferredDays: (days.length ? days : DEFAULT_DAYS_BY_FREQUENCY[freq] || base.preferredDays) as ScheduleDayLabel[],
    sessionMinutes: Number(row?.preferred_session_minutes) || 60,
    trainingSplit: (INTAKE_SPLITS.some((s) => s.id === row?.training_split) ? row.training_split : 'full_body') as IntakeSplit,
    experienceLevel: experience,
    equipment: equipment.length ? equipment : ['full_gym'],
    priorityAreas: Array.isArray(row?.priority_areas) ? row.priority_areas.map(String) : [],
    supersetPreference: (['minimal', 'sometimes', 'frequently', 'ai_decide'].includes(String(row?.superset_preference))
      ? row.superset_preference
      : 'sometimes') as IntakeSupersets,
    varietyPreference: (['consistent', 'balanced', 'high', 'ai_decide'].includes(String(row?.variety_preference))
      ? row.variety_preference
      : 'balanced') as IntakeVariety,
    trainingFeel: feel.filter((f: string) => INTAKE_FEEL_OPTIONS.some((o) => o.id === f)) as IntakeFeel[],
    limitations: Array.isArray(row?.intake_limitations) ? row.intake_limitations.filter((id: string) => INTAKE_LIMITATIONS.some((o) => o.id === id)) : [],
    includeCardioDay: parseDayAddon(row?.include_cardio_day),
    includeMobilityDay: parseDayAddon(row?.include_mobility_day),
    notes: String(row?.intake_notes || ''),
  };
}

export function trainingProfilePayload(intake: ProgramIntake) {
  const days = daysForIntake(intake);
  return {
    primary_goal: resolveGoal(intake.primaryGoal),
    experience_level: resolveExperience(intake.experienceLevel),
    training_days_per_week: days.length,
    preferred_session_minutes: intake.sessionMinutes,
    available_equipment: intake.equipment,
    preferred_training_days: days,
    training_split: intake.trainingSplit,
    priority_areas: intake.priorityAreas,
    superset_preference: intake.supersetPreference,
    variety_preference: intake.varietyPreference,
    training_feel: intake.trainingFeel,
    intake_limitations: intake.limitations,
    include_cardio_day: intake.includeCardioDay,
    include_mobility_day: intake.includeMobilityDay,
    intake_notes: intake.notes.trim() || null,
    training_style_preference: intake.trainingFeel[0] || 'balanced',
    excluded_exercises: excludedExercisesFromIntake(intake),
    injury_limitations: limitationNotes(intake),
    priority_muscles: intake.priorityAreas,
  };
}

export function generateBodyFromIntake(intake: ProgramIntake, extra: { weeks: number; programName: string; programId?: string; startDate?: string | null }) {
  const { days, dayTypes } = scheduleFromIntake(intake);
  return {
    structuredIntake: true,
    prompt: buildIntakeNarrative(intake),
    weeks: extra.weeks,
    days,
    dayTypes,
    programName: extra.programName,
    existingProgramId: extra.programId,
    startDate: extra.startDate || undefined,
    primaryGoal: resolveGoal(intake.primaryGoal),
    experienceLevel: resolveExperience(intake.experienceLevel),
    sessionMinutes: intake.sessionMinutes,
    availableEquipment: intake.equipment,
    focusMuscles: intake.priorityAreas.filter((a) => !['Conditioning', 'Mobility'].includes(a)),
    trainingSplit: intake.trainingSplit,
    includeCardio: resolveDayAddon(intake.includeCardioDay, shouldRecommendCardioDay(intake)),
    includeMobility: resolveDayAddon(intake.includeMobilityDay, shouldRecommendMobilityDay(intake)),
    includeMobilityDay: resolveDayAddon(intake.includeMobilityDay, shouldRecommendMobilityDay(intake)),
    supersetPreference: intake.supersetPreference,
    varietyPreference: intake.varietyPreference,
    trainingFeel: intake.trainingFeel,
    limitations: intake.limitations,
    notes: intake.notes.trim(),
  };
}

export function assertIntakeScheduleExamples() {
  const three: ProgramIntake = {
    ...defaultProgramIntake(),
    trainingDaysPerWeek: 3,
    preferredDays: ['Mon', 'Wed', 'Fri'],
    trainingSplit: 'full_body',
    sessionMinutes: 60,
  };
  const days = daysForIntake(three);
  const types = dayTypesForIntake(three, days);
  if (days.join(',') !== 'Mon,Wed,Fri') throw new Error(`Expected Mon,Wed,Fri got ${days.join(',')}`);
  if (types.Mon !== 'Full Body' || types.Fri !== 'Full Body') throw new Error('3-day full body should stay Full Body');
  const ul: ProgramIntake = { ...three, trainingSplit: 'upper_lower', preferredDays: ['Mon', 'Tue', 'Thu', 'Fri'] };
  const ulDays = daysForIntake(ul);
  const ulTypes = dayTypesForIntake(ul, ulDays);
  if (ulTypes.Mon !== 'Upper Body' || ulTypes.Tue !== 'Lower Body') {
    throw new Error(`Upper/lower mapping failed: ${JSON.stringify(ulTypes)}`);
  }
  const withCardio: ProgramIntake = { ...three, includeCardioDay: 'yes', includeMobilityDay: 'no' };
  const cardioSchedule = scheduleFromIntake(withCardio);
  if (!cardioSchedule.days.includes('Tue') || cardioSchedule.dayTypes.Tue !== 'Cardio') {
    throw new Error(`Expected cardio on an unused day, got ${JSON.stringify(cardioSchedule)}`);
  }
  if (cardioSchedule.dayTypes.Mon !== 'Full Body') {
    throw new Error('Cardio addon should not replace lift days when a weekday is free');
  }
  const withMobility: ProgramIntake = { ...three, includeCardioDay: 'no', includeMobilityDay: 'yes' };
  const mobilitySchedule = scheduleFromIntake(withMobility);
  if (!Object.values(mobilitySchedule.dayTypes).includes('Mobility')) {
    throw new Error(`Expected a Mobility day, got ${JSON.stringify(mobilitySchedule)}`);
  }
  const noAddons: ProgramIntake = { ...three, includeCardioDay: 'no', includeMobilityDay: 'no' };
  const none = scheduleFromIntake(noAddons);
  if (Object.values(none.dayTypes).some((t) => t === 'Cardio' || t === 'Mobility')) {
    throw new Error('No addons should keep strength-only days');
  }
}
