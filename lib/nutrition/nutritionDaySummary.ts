import { supabase } from '../supabaseClient';
import { goalsFromRow, sumMacros } from './macros';

export async function fetchNutritionDaySummary(userId: string, logDate: string) {
  const [entriesRes, goalsRes] = await Promise.all([
    supabase.from('st_meal_entries').select('calories,protein_g,carbs_g,fat_g').eq('user_id', userId).eq('log_date', logDate),
    supabase.from('st_nutrition_goals').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  if (entriesRes.error) throw entriesRes.error;
  if (goalsRes.error) throw goalsRes.error;
  const totals = sumMacros(entriesRes.data || []);
  const goals = goalsFromRow(goalsRes.data);
  return { totals, goals, entryCount: (entriesRes.data || []).length, goalRow: goalsRes.data || null };
}
