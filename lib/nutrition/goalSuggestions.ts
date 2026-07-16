import { DEFAULT_NUTRITION_GOALS, NutritionGoals, parseMacroInput } from './macros';

export type ProfileForGoalSuggestion = {
  weight_lbs?: number | null;
  height_inches?: number | null;
  birth_year?: number | null;
  sex?: string | null;
  primary_goal?: string | null;
  experience_level?: string | null;
};

export type GoalSuggestionResult = NutritionGoals & {
  summary: string;
  canSuggest: boolean;
  bmr?: number;
  tdee?: number;
};

const GOAL_LABELS: Record<string, string> = {
  general_health: 'general health',
  strength: 'strength',
  muscle: 'building muscle',
  fat_loss: 'fat loss',
};

function lbsToKg(lbs: number): number {
  return lbs / 2.20462;
}

function inchesToCm(inches: number): number {
  return inches * 2.54;
}

function estimateAge(birthYear?: number | null): number {
  const year = Number(birthYear);
  if (!Number.isFinite(year) || year < 1900) return 30;
  return Math.max(16, Math.min(80, new Date().getFullYear() - year));
}

/** Mifflin-St Jeor BMR (kcal/day). */
export function estimateBmr(profile: ProfileForGoalSuggestion): number | null {
  const weight = Number(profile.weight_lbs);
  const height = Number(profile.height_inches);
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(height) || height <= 0) return null;

  const weightKg = lbsToKg(weight);
  const heightCm = inchesToCm(height);
  const age = estimateAge(profile.birth_year);
  const sex = String(profile.sex || '').toLowerCase();

  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === 'female') bmr -= 161;
  else if (sex === 'male') bmr += 5;
  else bmr -= 78; // midpoint when sex not specified

  return Math.round(Math.max(1000, bmr));
}

function activityMultiplier(experience?: string | null): number {
  const level = String(experience || '').toLowerCase();
  if (level === 'advanced') return 1.65;
  if (level === 'intermediate') return 1.55;
  return 1.45; // beginner / default — active wellness app user
}

function calorieFloor(sex?: string | null): number {
  return String(sex || '').toLowerCase() === 'female' ? 1200 : 1500;
}

function proteinPerLb(goal: string): number {
  if (goal === 'fat_loss') return 1.0;
  if (goal === 'muscle') return 1.1;
  if (goal === 'strength') return 1.0;
  return 0.85;
}

function calorieAdjustment(goal: string, tdee: number, sex?: string | null): number {
  if (goal === 'fat_loss') return Math.max(calorieFloor(sex), tdee - 400);
  if (goal === 'muscle') return tdee + 250;
  if (goal === 'strength') return tdee + 150;
  return tdee;
}

export function suggestNutritionGoals(
  profile: ProfileForGoalSuggestion | null | undefined,
  experienceLevel?: string | null
): GoalSuggestionResult {
  const bmr = profile ? estimateBmr(profile) : null;
  if (!bmr || !profile) {
    return {
      ...DEFAULT_NUTRITION_GOALS,
      summary: 'Add height and weight in Settings → Profile to get personalized macro suggestions.',
      canSuggest: false,
    };
  }

  const tdee = Math.round(bmr * activityMultiplier(experienceLevel));
  const goal = String(profile.primary_goal || 'general_health').toLowerCase();
  const weight = Number(profile.weight_lbs) || 170;
  const calories = Math.max(calorieFloor(profile.sex), calorieAdjustment(goal, tdee, profile.sex));
  const protein_g = Math.round(weight * proteinPerLb(goal));
  const fatCalories = Math.round(calories * 0.27);
  const fat_g = Math.max(0, Math.round(fatCalories / 9));
  const carbCalories = Math.max(0, calories - protein_g * 4 - fat_g * 9);
  const carbs_g = Math.max(0, Math.round(carbCalories / 4));

  const goalLabel = GOAL_LABELS[goal] || GOAL_LABELS.general_health;

  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
    bmr,
    tdee,
    canSuggest: true,
    summary: `Based on your profile (${Math.round(weight)} lb, ${goalLabel}): ~${calories} cal/day from estimated maintenance ${tdee} kcal. General wellness guidance — adjust with your coach or dietitian if needed.`,
  };
}

export function goalsMatchDefaults(goals: NutritionGoals): boolean {
  return (
    goals.calories === DEFAULT_NUTRITION_GOALS.calories &&
    goals.protein_g === DEFAULT_NUTRITION_GOALS.protein_g &&
    goals.carbs_g === DEFAULT_NUTRITION_GOALS.carbs_g &&
    goals.fat_g === DEFAULT_NUTRITION_GOALS.fat_g
  );
}

export function applyGoalSuggestion(suggestion: GoalSuggestionResult): NutritionGoals {
  return {
    calories: parseMacroInput(suggestion.calories),
    protein_g: parseMacroInput(suggestion.protein_g),
    carbs_g: parseMacroInput(suggestion.carbs_g),
    fat_g: parseMacroInput(suggestion.fat_g),
  };
}
