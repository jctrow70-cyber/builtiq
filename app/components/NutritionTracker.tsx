'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import DateInput from './DateInput';
import {
  DEFAULT_NUTRITION_GOALS,
  FoodLibraryItem,
  formatMacro,
  formatMacroLine,
  goalsFromRow,
  groupEntriesByMeal,
  macroProgress,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  MealEntry,
  MealType,
  NutritionGoals,
  parseMacroInput,
  scaleMacros,
  sumMacros,
} from '../../lib/nutrition/macros';
import { formatDisplayDate, todayYmd } from '../../lib/training/programCalendar';

type NutritionTrackerProps = {
  userId: string;
  initialDate?: string;
  onDateChange?: (date: string) => void;
};

type AddFoodDraft = {
  meal_type: MealType;
  food_name: string;
  serving_qty: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  saveToLibrary: boolean;
};

const emptyAddDraft = (meal: MealType = 'breakfast'): AddFoodDraft => ({
  meal_type: meal,
  food_name: '',
  serving_qty: '1',
  calories: '',
  protein_g: '',
  carbs_g: '',
  fat_g: '',
  saveToLibrary: false,
});

function MacroBar({
  label,
  actual,
  target,
  unit = 'g',
}: {
  label: string;
  actual: number;
  target: number;
  unit?: string;
}) {
  const pct = macroProgress(actual, target);
  return (
    <div className="nutrition-macro-bar">
      <div className="nutrition-macro-bar-head">
        <span>{label}</span>
        <span className="muted">
          {formatMacro(actual)}
          {unit === 'g' ? 'g' : ''} / {formatMacro(target)}
          {unit === 'g' ? 'g' : ''}
        </span>
      </div>
      <div className="nutrition-progress-track">
        <div className="nutrition-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function NutritionTracker({
  userId,
  initialDate,
  onDateChange,
}: NutritionTrackerProps) {
  const [logDate, setLogDate] = useState(initialDate || todayYmd());
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>({ ...DEFAULT_NUTRITION_GOALS });
  const [savedFoods, setSavedFoods] = useState<FoodLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [addDraft, setAddDraft] = useState<AddFoodDraft>(emptyAddDraft());
  const [goalsDraft, setGoalsDraft] = useState<NutritionGoals>({ ...DEFAULT_NUTRITION_GOALS });
  const [foodSearch, setFoodSearch] = useState('');

  const totals = useMemo(() => sumMacros(entries), [entries]);
  const grouped = useMemo(() => groupEntriesByMeal(entries), [entries]);

  const filteredFoods = useMemo(() => {
    const q = foodSearch.trim().toLowerCase();
    return (savedFoods || [])
      .filter((f) => !f.is_archived)
      .filter((f) => !q || String(f.name || '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [savedFoods, foodSearch]);

  const setDate = useCallback(
    (next: string) => {
      setLogDate(next);
      onDateChange?.(next);
    },
    [onDateChange]
  );

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const [entriesRes, goalsRes, foodsRes] = await Promise.all([
        supabase
          .from('st_meal_entries')
          .select('*')
          .eq('user_id', userId)
          .eq('log_date', logDate)
          .order('created_at', { ascending: true }),
        supabase.from('st_nutrition_goals').select('*').eq('user_id', userId).maybeSingle(),
        supabase
          .from('st_food_library')
          .select('*')
          .eq('user_id', userId)
          .eq('is_archived', false)
          .order('name', { ascending: true }),
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (goalsRes.error) throw goalsRes.error;
      if (foodsRes.error) throw foodsRes.error;

      setEntries((entriesRes.data || []) as MealEntry[]);
      const nextGoals = goalsFromRow(goalsRes.data);
      setGoals(nextGoals);
      setGoalsDraft(nextGoals);
      setSavedFoods((foodsRes.data || []) as FoodLibraryItem[]);
    } catch (e: any) {
      setError(e?.message || 'Could not load nutrition data.');
    } finally {
      setLoading(false);
    }
  }, [userId, logDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (initialDate && initialDate !== logDate) setLogDate(initialDate);
  }, [initialDate]);

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
    setShowGoals(false);
  }

  async function addFoodEntry(fromLibrary?: FoodLibraryItem, qty = 1, meal?: MealType) {
    if (!userId) return;
    const mealType = meal || addDraft.meal_type;

    let macros = {
      calories: parseMacroInput(addDraft.calories),
      protein_g: parseMacroInput(addDraft.protein_g),
      carbs_g: parseMacroInput(addDraft.carbs_g),
      fat_g: parseMacroInput(addDraft.fat_g),
    };
    let foodName = addDraft.food_name.trim();
    let libraryId: string | null = null;
    const servingQty = Math.max(0.25, parseMacroInput(fromLibrary ? qty : addDraft.serving_qty) || 1);

    if (fromLibrary) {
      foodName = fromLibrary.name;
      libraryId = fromLibrary.id;
      macros = scaleMacros(fromLibrary, servingQty);
    } else {
      if (!foodName) return alert('Enter a food name.');
      macros = scaleMacros(
        {
          calories: parseMacroInput(addDraft.calories),
          protein_g: parseMacroInput(addDraft.protein_g),
          carbs_g: parseMacroInput(addDraft.carbs_g),
          fat_g: parseMacroInput(addDraft.fat_g),
        },
        servingQty
      );
    }

    setSaving(true);
    setError('');

    if (!fromLibrary && addDraft.saveToLibrary && foodName) {
      const { data: libRow, error: libError } = await supabase
        .from('st_food_library')
        .insert({
          user_id: userId,
          name: foodName,
          serving_label: servingQty === 1 ? '1 serving' : `${servingQty} servings`,
          calories: parseMacroInput(addDraft.calories),
          protein_g: parseMacroInput(addDraft.protein_g),
          carbs_g: parseMacroInput(addDraft.carbs_g),
          fat_g: parseMacroInput(addDraft.fat_g),
        })
        .select()
        .single();
      if (libError) {
        setSaving(false);
        return setError(libError.message);
      }
      if (libRow) {
        libraryId = libRow.id;
        setSavedFoods((prev) => [...prev, libRow as FoodLibraryItem].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }

    const { data, error: insertError } = await supabase
      .from('st_meal_entries')
      .insert({
        user_id: userId,
        log_date: logDate,
        meal_type: mealType,
        food_name: foodName,
        food_library_id: libraryId,
        serving_qty: servingQty,
        calories: macros.calories,
        protein_g: macros.protein_g,
        carbs_g: macros.carbs_g,
        fat_g: macros.fat_g,
      })
      .select()
      .single();

    setSaving(false);
    if (insertError) return setError(insertError.message);
    if (data) setEntries((prev) => [...prev, data as MealEntry]);
    if (!fromLibrary) {
      setAddDraft(emptyAddDraft(mealType));
      setShowAdd(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Remove this food entry?')) return;
    const { error: delError } = await supabase.from('st_meal_entries').delete().eq('id', id);
    if (delError) return setError(delError.message);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function duplicateEntry(entry: MealEntry) {
    if (!userId) return;
    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('st_meal_entries')
      .insert({
        user_id: userId,
        log_date: logDate,
        meal_type: entry.meal_type,
        food_name: entry.food_name,
        food_library_id: entry.food_library_id || null,
        serving_qty: entry.serving_qty,
        calories: entry.calories,
        protein_g: entry.protein_g,
        carbs_g: entry.carbs_g,
        fat_g: entry.fat_g,
        notes: entry.notes || null,
      })
      .select()
      .single();
    setSaving(false);
    if (insertError) return setError(insertError.message);
    if (data) setEntries((prev) => [...prev, data as MealEntry]);
  }

  async function copyYesterday() {
    if (!userId) return;
    const prev = new Date(`${logDate}T12:00:00`);
    prev.setDate(prev.getDate() - 1);
    const prevYmd = prev.toISOString().slice(0, 10);
    const { data, error: fetchError } = await supabase
      .from('st_meal_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', prevYmd);
    if (fetchError) return setError(fetchError.message);
    if (!data?.length) return alert('No meals logged yesterday to copy.');
    if (!confirm(`Copy ${data.length} item(s) from ${formatDisplayDate(prevYmd)}?`)) return;

    setSaving(true);
    const rows = data.map((row: MealEntry) => ({
      user_id: userId,
      log_date: logDate,
      meal_type: row.meal_type,
      food_name: row.food_name,
      food_library_id: row.food_library_id || null,
      serving_qty: row.serving_qty,
      calories: row.calories,
      protein_g: row.protein_g,
      carbs_g: row.carbs_g,
      fat_g: row.fat_g,
      notes: row.notes || null,
    }));
    const { data: inserted, error: insertError } = await supabase
      .from('st_meal_entries')
      .insert(rows)
      .select();
    setSaving(false);
    if (insertError) return setError(insertError.message);
    setEntries((prev) => [...prev, ...((inserted || []) as MealEntry[])]);
  }

  function shiftDate(days: number) {
    const d = new Date(`${logDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  return (
    <section className="nutrition-tracker">
      <div className="card nutrition-summary-card">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>Daily nutrition</h2>
          <span className="badge">{formatDisplayDate(logDate)}</span>
        </div>
        <div className="nutrition-date-row">
          <button type="button" className="btn small secondary" onClick={() => shiftDate(-1)}>
            Prev
          </button>
          <DateInput value={logDate} onChange={setDate} />
          <button type="button" className="btn small secondary" onClick={() => shiftDate(1)}>
            Next
          </button>
          <button type="button" className="btn small secondary" onClick={() => setDate(todayYmd())}>
            Today
          </button>
        </div>
        {loading ? (
          <p className="muted">Loading nutrition log...</p>
        ) : (
          <>
            <div className="nutrition-totals-grid">
              <div className="nutrition-total-tile">
                <b>{formatMacro(totals.calories)}</b>
                <span className="muted">Calories</span>
              </div>
              <div className="nutrition-total-tile">
                <b>{formatMacro(totals.protein_g)}g</b>
                <span className="muted">Protein</span>
              </div>
              <div className="nutrition-total-tile">
                <b>{formatMacro(totals.carbs_g)}g</b>
                <span className="muted">Carbs</span>
              </div>
              <div className="nutrition-total-tile">
                <b>{formatMacro(totals.fat_g)}g</b>
                <span className="muted">Fat</span>
              </div>
            </div>
            <div className="nutrition-macro-bars">
              <MacroBar label="Calories" actual={totals.calories} target={goals.calories} unit="" />
              <MacroBar label="Protein" actual={totals.protein_g} target={goals.protein_g} />
              <MacroBar label="Carbs" actual={totals.carbs_g} target={goals.carbs_g} />
              <MacroBar label="Fat" actual={totals.fat_g} target={goals.fat_g} />
            </div>
          </>
        )}
        <div className="actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn green" onClick={() => setShowAdd(true)} disabled={saving}>
            Add food
          </button>
          <button type="button" className="btn secondary" onClick={() => setShowGoals(true)} disabled={saving}>
            Edit goals
          </button>
          <button type="button" className="btn secondary" onClick={copyYesterday} disabled={saving}>
            Copy yesterday
          </button>
        </div>
        {error && <p className="nutrition-error">{error}</p>}
      </div>

      {showGoals && (
        <div className="card nutrition-goals-card">
          <h3>Daily macro goals</h3>
          <div className="row">
            <div>
              <label htmlFor="goal-calories">Calories</label>
              <input
                id="goal-calories"
                type="number"
                min="0"
                value={goalsDraft.calories}
                onChange={(e) => setGoalsDraft({ ...goalsDraft, calories: parseMacroInput(e.target.value) })}
              />
            </div>
            <div>
              <label htmlFor="goal-protein">Protein (g)</label>
              <input
                id="goal-protein"
                type="number"
                min="0"
                value={goalsDraft.protein_g}
                onChange={(e) => setGoalsDraft({ ...goalsDraft, protein_g: parseMacroInput(e.target.value) })}
              />
            </div>
          </div>
          <div className="row">
            <div>
              <label htmlFor="goal-carbs">Carbs (g)</label>
              <input
                id="goal-carbs"
                type="number"
                min="0"
                value={goalsDraft.carbs_g}
                onChange={(e) => setGoalsDraft({ ...goalsDraft, carbs_g: parseMacroInput(e.target.value) })}
              />
            </div>
            <div>
              <label htmlFor="goal-fat">Fat (g)</label>
              <input
                id="goal-fat"
                type="number"
                min="0"
                value={goalsDraft.fat_g}
                onChange={(e) => setGoalsDraft({ ...goalsDraft, fat_g: parseMacroInput(e.target.value) })}
              />
            </div>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn green" onClick={saveGoals} disabled={saving}>
              {saving ? 'Saving...' : 'Save goals'}
            </button>
            <button type="button" className="btn secondary" onClick={() => setShowGoals(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="card nutrition-add-card">
          <h3>Add food</h3>
          <label htmlFor="add-meal">Meal</label>
          <select
            id="add-meal"
            value={addDraft.meal_type}
            onChange={(e) => setAddDraft({ ...addDraft, meal_type: e.target.value as MealType })}
          >
            {MEAL_TYPES.map((meal) => (
              <option key={meal} value={meal}>
                {MEAL_TYPE_LABELS[meal]}
              </option>
            ))}
          </select>
          <label htmlFor="add-name">Food name</label>
          <input
            id="add-name"
            value={addDraft.food_name}
            onChange={(e) => setAddDraft({ ...addDraft, food_name: e.target.value })}
            placeholder="e.g. Chicken breast and rice"
          />
          <div className="row">
            <div>
              <label htmlFor="add-qty">Servings</label>
              <input
                id="add-qty"
                type="number"
                min="0.25"
                step="0.25"
                value={addDraft.serving_qty}
                onChange={(e) => setAddDraft({ ...addDraft, serving_qty: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="add-cal">Calories (per serving)</label>
              <input
                id="add-cal"
                type="number"
                min="0"
                value={addDraft.calories}
                onChange={(e) => setAddDraft({ ...addDraft, calories: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div>
              <label htmlFor="add-protein">Protein g</label>
              <input
                id="add-protein"
                type="number"
                min="0"
                value={addDraft.protein_g}
                onChange={(e) => setAddDraft({ ...addDraft, protein_g: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="add-carbs">Carbs g</label>
              <input
                id="add-carbs"
                type="number"
                min="0"
                value={addDraft.carbs_g}
                onChange={(e) => setAddDraft({ ...addDraft, carbs_g: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="add-fat">Fat g</label>
              <input
                id="add-fat"
                type="number"
                min="0"
                value={addDraft.fat_g}
                onChange={(e) => setAddDraft({ ...addDraft, fat_g: e.target.value })}
              />
            </div>
          </div>
          <label className="remember-row">
            <input
              type="checkbox"
              checked={addDraft.saveToLibrary}
              onChange={(e) => setAddDraft({ ...addDraft, saveToLibrary: e.target.checked })}
            />
            Save to my foods for quick add later
          </label>
          <div className="actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn green"
              onClick={() => addFoodEntry()}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Log food'}
            </button>
            <button type="button" className="btn secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card nutrition-library-card">
        <h3>My foods</h3>
        <p className="muted">Quick-add saved foods. Macros are snapshotted when logged so history stays accurate.</p>
        <input
          value={foodSearch}
          onChange={(e) => setFoodSearch(e.target.value)}
          placeholder="Search saved foods"
        />
        {filteredFoods.length === 0 ? (
          <p className="muted">No saved foods yet. Log a food and check &ldquo;Save to my foods&rdquo; to build your library.</p>
        ) : (
          <div className="nutrition-food-grid">
            {filteredFoods.map((food) => (
              <div key={food.id} className="nutrition-food-chip">
                <div>
                  <b>{food.name}</b>
                  <span className="muted">{formatMacroLine(food)}</span>
                </div>
                <div className="nutrition-food-chip-actions">
                  {MEAL_TYPES.map((meal) => (
                    <button
                      key={meal}
                      type="button"
                      className="btn small secondary"
                      onClick={() => addFoodEntry(food, 1, meal)}
                      disabled={saving}
                      title={`Add to ${MEAL_TYPE_LABELS[meal]}`}
                    >
                      + {MEAL_TYPE_LABELS[meal].slice(0, 1)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {MEAL_TYPES.map((meal) => {
        const mealEntries = grouped[meal];
        const mealTotals = sumMacros(mealEntries);
        return (
          <div className="card nutrition-meal-card" key={meal}>
            <div className="topline" style={{ justifyContent: 'space-between' }}>
              <h3>{MEAL_TYPE_LABELS[meal]}</h3>
              <span className="badge">
                {mealEntries.length ? formatMacroLine(mealTotals) : 'No items'}
              </span>
            </div>
            {mealEntries.length === 0 ? (
              <p className="muted">Nothing logged yet.</p>
            ) : (
              <div className="nutrition-entry-list">
                {mealEntries.map((entry) => (
                  <div className="nutrition-entry-row" key={entry.id}>
                    <div className="nutrition-entry-main">
                      <b>
                        {entry.food_name}
                        {entry.serving_qty !== 1 ? ` × ${entry.serving_qty}` : ''}
                      </b>
                      <span className="muted">{formatMacroLine(entry)}</span>
                    </div>
                    <div className="nutrition-entry-actions">
                      <button
                        type="button"
                        className="btn small secondary"
                        onClick={() => duplicateEntry(entry)}
                        disabled={saving}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="btn small red"
                        onClick={() => deleteEntry(entry.id)}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn small secondary"
              style={{ marginTop: 8 }}
              onClick={() => {
                setAddDraft(emptyAddDraft(meal));
                setShowAdd(true);
              }}
            >
              + Add to {MEAL_TYPE_LABELS[meal]}
            </button>
          </div>
        );
      })}
    </section>
  );
}

export async function fetchNutritionDaySummary(userId: string, logDate: string) {
  const [entriesRes, goalsRes] = await Promise.all([
    supabase.from('st_meal_entries').select('calories,protein_g,carbs_g,fat_g').eq('user_id', userId).eq('log_date', logDate),
    supabase.from('st_nutrition_goals').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  if (entriesRes.error) throw entriesRes.error;
  if (goalsRes.error) throw goalsRes.error;
  const totals = sumMacros(entriesRes.data || []);
  const goals = goalsFromRow(goalsRes.data);
  return { totals, goals, entryCount: (entriesRes.data || []).length };
}
