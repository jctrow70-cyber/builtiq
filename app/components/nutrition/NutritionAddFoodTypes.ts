import type { MealType } from '../../../lib/nutrition/macros';

export type FoodDraft = {
  meal_type: MealType;
  food_name: string;
  serving_size: string;
  serving_unit: string;
  amount: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  saveToLibrary: boolean;
};
