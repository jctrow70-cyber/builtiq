import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dashboardNutritionModel, dashboardTargetsFromGoalRow } from '../lib/nutrition/dashboardNutrition';
import { goalsFromRow, sumMacros } from '../lib/nutrition/macros';
import { shouldOpenNutritionAdd } from '../lib/nutrition/nutritionLaunch';

const customRow = {
  calories_target: 2200,
  protein_g_target: 160,
  carbs_g_target: 210,
  fat_g_target: 70,
};
const custom = dashboardTargetsFromGoalRow(customRow);
assert.deepEqual(custom, { calories: 2200, protein_g: 160, carbs_g: 210, fat_g: 70 });

const missing = dashboardTargetsFromGoalRow(null);
assert.deepEqual(missing, { calories: null, protein_g: null, carbs_g: null, fat_g: null });
assert.equal(goalsFromRow(null).calories, 2000);
assert.equal(goalsFromRow(null).protein_g, 150);

const partial = dashboardTargetsFromGoalRow({
  calories_target: 1800,
  protein_g_target: 0,
  carbs_g_target: 'nope',
  fat_g_target: -5,
});
assert.equal(partial.calories, 1800);
assert.equal(partial.protein_g, null);
assert.equal(partial.carbs_g, null);
assert.equal(partial.fat_g, null);
assert.equal(goalsFromRow({ calories_target: 0, protein_g_target: 0, carbs_g_target: 0, fat_g_target: 0 }).calories, 2000);

const none = dashboardNutritionModel(sumMacros([]), 0, missing);
assert.equal(none.noMeals, true);
assert.equal(none.zeroCalorieLog, false);
assert.equal(none.caloriesText, '0');
assert.equal(none.calorieTargetText, null);
assert.equal(none.calorieRemainingText, null);
assert.equal(none.calorieRatio, null);
assert.equal(none.needsGoals, true);
assert.equal(none.macros.every((macro) => macro.ratio == null), true);

const zeroMeal = dashboardNutritionModel(
  sumMacros([{ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }]),
  1,
  custom
);
assert.equal(zeroMeal.noMeals, false);
assert.equal(zeroMeal.zeroCalorieLog, true);
assert.equal(zeroMeal.caloriesText, '0');
assert.equal(zeroMeal.calorieTargetText, '2200');
assert.equal(zeroMeal.calorieRemainingText, '2200 Remaining');
assert.equal(zeroMeal.calorieStatus, 'primary');

const saved = dashboardNutritionModel(
  sumMacros([{ calories: 500, protein_g: 40, carbs_g: 50, fat_g: 15 }]),
  1,
  custom
);
assert.equal(saved.noMeals, false);
assert.equal(saved.calorieTargetText, '2200');
assert.equal(saved.macros[0].detailText, '40g / 160g');
assert.equal(saved.needsGoals, false);

const over = dashboardNutritionModel(
  sumMacros([{ calories: 2500, protein_g: 180, carbs_g: 210, fat_g: 70 }]),
  1,
  custom
);
assert.equal(over.caloriesText, '2500');
assert.equal(over.calorieTargetText, '2200');
assert.equal(over.calorieRemainingText, '300 Over');
assert.equal(over.calorieStatus, 'over');
assert.equal(over.calorieRatio, 1);
assert.equal(over.macros[0].detailText, '180g / 160g Over');
assert.equal(over.macros[0].status, 'over');
assert.equal(over.macros[0].ratio, 1);
assert.equal(over.macros[1].detailText, '210g / 210g');

const mixed = dashboardNutritionModel(
  sumMacros([{ calories: 1800, protein_g: 90, carbs_g: 200, fat_g: 60 }]),
  1,
  partial
);
assert.equal(mixed.calorieTargetText, '1800');
assert.equal(mixed.macros[0].detailText, '90g');
assert.equal(mixed.macros[0].ratio, null);
assert.equal(mixed.macros[1].ratio, null);
assert.equal(mixed.needsGoals, true);

assert.equal(shouldOpenNutritionAdd(null, null), false);
assert.equal(shouldOpenNutritionAdd({ id: 1, openAdd: true }, null), true);
assert.equal(shouldOpenNutritionAdd({ id: 1, openAdd: true }, 1), false);
assert.equal(shouldOpenNutritionAdd({ id: 2, openAdd: true }, 1), true);

const card = readFileSync('app/components/dashboard/NutritionDashboardCard.tsx', 'utf8');
assert.equal(card.includes('DEFAULT_NUTRITION_GOALS'), false);
assert.equal(card.includes('macroProgress'), false);
assert.equal(card.includes('goalsFromRow'), false);
assert.equal(card.includes('summary.goals'), false);
assert.equal(card.includes('fetchNutritionDaySummary'), true);
assert.equal(card.includes('dashboardTargetsFromGoalRow'), true);
assert.equal(card.includes('setReloadKey'), true);
assert.equal(card.includes('Try again'), true);
assert.equal(card.includes('No meals logged today.'), true);
assert.equal(card.includes('Logged today.'), true);
assert.equal(card.includes('st_team_members'), false);
assert.equal(card.includes('st_food_library'), false);
assert.equal(card.includes('NutritionAddFoodPanel'), false);

const query = readFileSync('lib/nutrition/nutritionDaySummary.ts', 'utf8');
const summaryFn = query.slice(query.indexOf('export async function fetchNutritionDaySummary'));
assert.equal(summaryFn.includes(".eq('user_id', userId)"), true);
assert.equal(summaryFn.includes('sumMacros'), true);
assert.equal(summaryFn.includes('goalsFromRow'), true);
assert.equal(summaryFn.includes('goalRow:'), true);
assert.equal(summaryFn.includes('st_team_members'), false);
assert.equal(summaryFn.includes('st_set_logs'), false);

const macros = readFileSync('lib/nutrition/macros.ts', 'utf8');
const goalsFn = macros.slice(macros.indexOf('export function goalsFromRow'), macros.indexOf('export function entryToPerServing'));
assert.equal(goalsFn.includes('DEFAULT_NUTRITION_GOALS'), true);

const page = readFileSync('app/page.tsx', 'utf8');
const logMeal = page.slice(page.indexOf('function openLogMeal'), page.indexOf('function openNutritionLog'));
assert.ok(logMeal.indexOf("goNav('Nutrition')") < logMeal.indexOf('setNutritionLaunch'));
assert.equal(logMeal.includes('openAdd:true'), true);
const viewLog = page.slice(page.indexOf('function openNutritionLog'), page.indexOf('function openNutritionGoals'));
assert.equal(viewLog.includes("goNav('Nutrition')"), true);
assert.equal(viewLog.includes('openAdd'), false);
const setGoals = page.slice(page.indexOf('function openNutritionGoals'), page.indexOf('function openTrainingWeekDay'));
assert.equal(setGoals.includes("goNav('Settings')"), true);
assert.equal(page.includes('id="nutrition-goals"'), true);
assert.equal(page.includes('Log food'), false);
assert.equal(page.includes('nutritionCalPct'), false);
const nav = page.slice(page.indexOf('function goNav'), page.indexOf('function openNotificationTarget'));
assert.equal(nav.includes('setNutritionLaunch(null)'), true);
assert.equal(page.includes('userId={session.user.id}'), true);

const tracker = readFileSync('app/components/NutritionTracker.tsx', 'utf8');
assert.equal(tracker.includes('shouldOpenNutritionAdd'), true);
assert.equal(tracker.includes('onLaunchConsumed'), true);
assert.equal(tracker.includes('NutritionAddFoodPanel'), true);

console.log('nutrition dashboard tests passed');
