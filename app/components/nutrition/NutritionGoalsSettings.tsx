'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
  DEFAULT_NUTRITION_GOALS,
  formatMacro,
  goalsFromRow,
  NutritionGoals,
  parseMacroInput,
} from '../../../lib/nutrition/macros';
import {
  applyGoalSuggestion,
  goalsMatchDefaults,
  ProfileForGoalSuggestion,
  suggestNutritionGoals,
} from '../../../lib/nutrition/goalSuggestions';

type NutritionGoalsSettingsProps = {
  userId: string;
  onSaved?: () => void;
};

export default function NutritionGoalsSettings({ userId, onSaved }: NutritionGoalsSettingsProps) {
  const [goals, setGoals] = useState<NutritionGoals>({ ...DEFAULT_NUTRITION_GOALS });
  const [goalsDraft, setGoalsDraft] = useState<NutritionGoals>({ ...DEFAULT_NUTRITION_GOALS });
  const [profileForGoals, setProfileForGoals] = useState<ProfileForGoalSuggestion | null>(null);
  const [hasSavedGoals, setHasSavedGoals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const goalSuggestion = useMemo(
    () => suggestNutritionGoals(profileForGoals, profileForGoals?.experience_level),
    [profileForGoals]
  );

  const showGoalSuggestionBanner =
    goalSuggestion.canSuggest && (!hasSavedGoals || goalsMatchDefaults(goals));

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const [goalsRes, profileRes] = await Promise.all([
        supabase.from('st_nutrition_goals').select('*').eq('user_id', userId).maybeSingle(),
        supabase
          .from('st_profiles')
          .select('weight_lbs,height_inches,birth_year,sex,primary_goal,experience_level')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);
      if (goalsRes.error) throw goalsRes.error;
      if (profileRes.error) throw profileRes.error;
      const nextGoals = goalsFromRow(goalsRes.data);
      setGoals(nextGoals);
      setGoalsDraft(nextGoals);
      setHasSavedGoals(!!goalsRes.data);
      setProfileForGoals((profileRes.data as ProfileForGoalSuggestion) || null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not load nutrition goals.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveGoals() {
    if (!userId) return;
    setSaving(true);
    setError('');
    const payload = {
      user_id: userId,
      calories_target: parseMacroInput(goalsDraft.calories),
      protein_g_target: parseMacroInput(goalsDraft.protein_g),
      carbs_g_target: parseMacroInput(goalsDraft.carbs_g),
      fat_g_target: parseMacroInput(goalsDraft.fat_g),
    };
    const { error: upsertError } = await supabase
      .from('st_nutrition_goals')
      .upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (upsertError) return setError(upsertError.message);
    setGoals({ ...goalsDraft });
    setHasSavedGoals(true);
    onSaved?.();
    await loadData();
  }

  function applySuggestedGoalsToDraft() {
    if (!goalSuggestion.canSuggest) return;
    setGoalsDraft(applyGoalSuggestion(goalSuggestion));
  }

  async function saveSuggestedGoals() {
    if (!goalSuggestion.canSuggest || !userId) return;
    const next = applyGoalSuggestion(goalSuggestion);
    setGoalsDraft(next);
    setSaving(true);
    setError('');
    const { error: upsertError } = await supabase.from('st_nutrition_goals').upsert(
      {
        user_id: userId,
        calories_target: next.calories,
        protein_g_target: next.protein_g,
        carbs_g_target: next.carbs_g,
        fat_g_target: next.fat_g,
      },
      { onConflict: 'user_id' }
    );
    setSaving(false);
    if (upsertError) return setError(upsertError.message);
    setGoals(next);
    setHasSavedGoals(true);
    onSaved?.();
    await loadData();
  }

  if (loading) {
    return (
      <div className="card nutrition-goals-settings-card">
        <h2>Nutrition goals</h2>
        <p className="muted">Loading...</p>
      </div>
    );
  }

  return (
    <>
      {showGoalSuggestionBanner && (
        <div className="card nutrition-goals-suggest-card">
          <div className="topline" style={{ justifyContent: 'space-between' }}>
            <h3>Suggested macro goals</h3>
            <span className="badge">From profile</span>
          </div>
          <p className="muted">{goalSuggestion.summary}</p>
          <div className="nutrition-totals-grid">
            <div className="nutrition-total-tile">
              <b>{formatMacro(goalSuggestion.calories)}</b>
              <span className="muted">Calories</span>
            </div>
            <div className="nutrition-total-tile">
              <b>{formatMacro(goalSuggestion.protein_g)}g</b>
              <span className="muted">Protein</span>
            </div>
            <div className="nutrition-total-tile">
              <b>{formatMacro(goalSuggestion.carbs_g)}g</b>
              <span className="muted">Carbs</span>
            </div>
            <div className="nutrition-total-tile">
              <b>{formatMacro(goalSuggestion.fat_g)}g</b>
              <span className="muted">Fat</span>
            </div>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn green" onClick={saveSuggestedGoals} disabled={saving}>
              {saving ? 'Saving...' : 'Apply suggested goals'}
            </button>
            <button type="button" className="btn secondary" onClick={applySuggestedGoalsToDraft} disabled={saving}>
              Review & edit
            </button>
          </div>
        </div>
      )}

      <div className="card nutrition-goals-card nutrition-goals-settings-card">
        <h2>Nutrition goals</h2>
        <p className="muted">Daily calorie and macro targets used on the Nutrition tab and dashboard.</p>
        {goalSuggestion.canSuggest && (
          <div className="nutrition-goals-suggest-inline">
            <p className="muted">{goalSuggestion.summary}</p>
            <div className="actions" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className="btn small secondary"
                onClick={applySuggestedGoalsToDraft}
                disabled={saving}
              >
                Fill from profile suggestion
              </button>
            </div>
          </div>
        )}
        <div className="row">
          <div>
            <label htmlFor="settings-goal-calories">Calories</label>
            <input
              id="settings-goal-calories"
              type="number"
              min="0"
              value={goalsDraft.calories}
              onChange={(e) => setGoalsDraft({ ...goalsDraft, calories: parseMacroInput(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="settings-goal-protein">Protein (g)</label>
            <input
              id="settings-goal-protein"
              type="number"
              min="0"
              value={goalsDraft.protein_g}
              onChange={(e) => setGoalsDraft({ ...goalsDraft, protein_g: parseMacroInput(e.target.value) })}
            />
          </div>
        </div>
        <div className="row">
          <div>
            <label htmlFor="settings-goal-carbs">Carbs (g)</label>
            <input
              id="settings-goal-carbs"
              type="number"
              min="0"
              value={goalsDraft.carbs_g}
              onChange={(e) => setGoalsDraft({ ...goalsDraft, carbs_g: parseMacroInput(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="settings-goal-fat">Fat (g)</label>
            <input
              id="settings-goal-fat"
              type="number"
              min="0"
              value={goalsDraft.fat_g}
              onChange={(e) => setGoalsDraft({ ...goalsDraft, fat_g: parseMacroInput(e.target.value) })}
            />
          </div>
        </div>
        {error && <p className="nutrition-error">{error}</p>}
        <div className="actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn green" onClick={saveGoals} disabled={saving}>
            {saving ? 'Saving...' : 'Save goals'}
          </button>
        </div>
      </div>
    </>
  );
}
