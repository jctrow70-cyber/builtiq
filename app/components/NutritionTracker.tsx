'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import NutritionWeeklySummary from './NutritionWeeklySummary';
import NutritionMacroDashboard from './NutritionMacroDashboard';
import {
  DEFAULT_NUTRITION_GOALS,
  entryToPerServing,
  FoodLibraryItem,
  formatMacro,
  formatMacroLine,
  goalsFromRow,
  groupEntriesByMeal,
  mealEntryFromDraft,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  MealEntry,
  MealTemplate,
  MealType,
  NutritionGoals,
  parseMacroInput,
  parseMealTemplate,
  scaleMacros,
  sumMacros,
  templateItemsFromEntries,
} from '../../lib/nutrition/macros';
import { buildWeeklyNutritionSummary } from '../../lib/nutrition/weeklySummary';
import {
  countFoodCatalogMatches,
  foodCatalogLabel,
  foodCatalogMeta,
  FoodCatalogItem,
  searchFoodCatalog,
} from '../../lib/nutrition/foodCatalogSearch';
import {
  AiFoodEstimateItem,
  AiFoodEstimateResult,
  AI_FOOD_DISCLAIMER,
  aiEstimateToDraft,
} from '../../lib/nutrition/aiFoodEstimate';
import {
  applyGoalSuggestion,
  goalsMatchDefaults,
  ProfileForGoalSuggestion,
  suggestNutritionGoals,
} from '../../lib/nutrition/goalSuggestions';
import {
  barcodeDisplayName,
  barcodeExtraNutritionNote,
  barcodeResultToDraft,
  isBarcodeLookupResult,
  scaleBarcodeNutrition,
  type BarcodeLookupNotFound,
  type BarcodeLookupResponse,
  type BarcodeLookupResult,
} from '../../lib/nutrition/barcodeLookup';
import { LABEL_OCR_DISCLAIMER } from '../../lib/nutrition/labelOcr';
import NutritionBarcodeScanner from './NutritionBarcodeScanner';
import { NutritionBarcodeNotFoundCard, NutritionBarcodeProductCard } from './NutritionBarcodeProduct';
import { currentCalendarWeekBounds, formatDisplayDate, parseYmd, todayYmd } from '../../lib/training/programCalendar';

type NutritionTrackerProps = {
  userId: string;
  initialDate?: string;
  onDateChange?: (date: string) => void;
  onDataChange?: () => void;
};

type FoodDraft = {
  meal_type: MealType;
  food_name: string;
  serving_qty: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  saveToLibrary: boolean;
};

type LibraryEditDraft = {
  name: string;
  serving_label: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

const emptyFoodDraft = (meal: MealType = 'breakfast'): FoodDraft => ({
  meal_type: meal,
  food_name: '',
  serving_qty: '1',
  calories: '',
  protein_g: '',
  carbs_g: '',
  fat_g: '',
  saveToLibrary: false,
});

type MyFoodsPanelProps = {
  foodSearch: string;
  setFoodSearch: (value: string) => void;
  foods: FoodLibraryItem[];
  saving: boolean;
  onEdit: (food: FoodLibraryItem) => void;
  onAddToMeal: (food: FoodLibraryItem, meal: MealType) => void;
};

function MyFoodsPanel({
  foodSearch,
  setFoodSearch,
  foods,
  saving,
  onEdit,
  onAddToMeal,
}: MyFoodsPanelProps) {
  return (
    <>
      <p className="muted nutrition-add-intro">
        Quick-add saved foods. Macros are snapshotted when logged so history stays accurate.
      </p>
      <input
        value={foodSearch}
        onChange={(e) => setFoodSearch(e.target.value)}
        placeholder="Search saved foods"
      />
      {foods.length === 0 ? (
        <p className="muted">
          No saved foods yet. Log a food and check &ldquo;Save to my foods&rdquo; to build your library.
        </p>
      ) : (
        <div className="nutrition-food-grid">
          {foods.map((food) => (
            <div key={food.id} className="nutrition-food-chip">
              <div>
                <b>{food.name}</b>
                <span className="muted">{formatMacroLine(food)}</span>
              </div>
              <div className="nutrition-food-chip-actions">
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => onEdit(food)}
                  disabled={saving}
                >
                  Edit
                </button>
                {MEAL_TYPES.map((meal) => (
                  <button
                    key={meal}
                    type="button"
                    className="btn small secondary"
                    onClick={() => onAddToMeal(food, meal)}
                    disabled={saving}
                    title={`Add to ${MEAL_TYPE_LABELS[meal]}`}
                  >
                    + {MEAL_TYPE_LABELS[meal]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FoodFormFields({
  draft,
  setDraft,
  idPrefix,
  showSaveToLibrary,
}: {
  draft: FoodDraft;
  setDraft: (next: FoodDraft) => void;
  idPrefix: string;
  showSaveToLibrary?: boolean;
}) {
  return (
    <>
      <label htmlFor={`${idPrefix}-meal`}>Meal</label>
      <select
        id={`${idPrefix}-meal`}
        value={draft.meal_type}
        onChange={(e) => setDraft({ ...draft, meal_type: e.target.value as MealType })}
      >
        {MEAL_TYPES.map((meal) => (
          <option key={meal} value={meal}>
            {MEAL_TYPE_LABELS[meal]}
          </option>
        ))}
      </select>
      <label htmlFor={`${idPrefix}-name`}>Food name</label>
      <input
        id={`${idPrefix}-name`}
        value={draft.food_name}
        onChange={(e) => setDraft({ ...draft, food_name: e.target.value })}
        placeholder="e.g. Chicken breast and rice"
      />
      <div className="row">
        <div>
          <label htmlFor={`${idPrefix}-qty`}>Servings</label>
          <input
            id={`${idPrefix}-qty`}
            type="number"
            min="0.25"
            step="0.25"
            value={draft.serving_qty}
            onChange={(e) => setDraft({ ...draft, serving_qty: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-cal`}>Calories (per serving)</label>
          <input
            id={`${idPrefix}-cal`}
            type="number"
            min="0"
            value={draft.calories}
            onChange={(e) => setDraft({ ...draft, calories: e.target.value })}
          />
        </div>
      </div>
      <div className="row">
        <div>
          <label htmlFor={`${idPrefix}-protein`}>Protein g</label>
          <input
            id={`${idPrefix}-protein`}
            type="number"
            min="0"
            value={draft.protein_g}
            onChange={(e) => setDraft({ ...draft, protein_g: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-carbs`}>Carbs g</label>
          <input
            id={`${idPrefix}-carbs`}
            type="number"
            min="0"
            value={draft.carbs_g}
            onChange={(e) => setDraft({ ...draft, carbs_g: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-fat`}>Fat g</label>
          <input
            id={`${idPrefix}-fat`}
            type="number"
            min="0"
            value={draft.fat_g}
            onChange={(e) => setDraft({ ...draft, fat_g: e.target.value })}
          />
        </div>
      </div>
      {showSaveToLibrary && (
        <label className="remember-row">
          <input
            type="checkbox"
            checked={draft.saveToLibrary}
            onChange={(e) => setDraft({ ...draft, saveToLibrary: e.target.checked })}
          />
          Save to my foods for quick add later
        </label>
      )}
    </>
  );
}

export default function NutritionTracker({
  userId,
  initialDate,
  onDateChange,
  onDataChange,
}: NutritionTrackerProps) {
  const [logDate, setLogDate] = useState(initialDate || todayYmd());
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<any[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>({ ...DEFAULT_NUTRITION_GOALS });
  const [savedFoods, setSavedFoods] = useState<FoodLibraryItem[]>([]);
  const [foodCatalog, setFoodCatalog] = useState<FoodCatalogItem[]>([]);
  const [mealTemplates, setMealTemplates] = useState<MealTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayRefreshing, setDayRefreshing] = useState(false);
  const [dayAnimDir, setDayAnimDir] = useState<'forward' | 'back' | 'none'>('none');
  const hasLoadedRef = useRef(false);
  const daySwipeStart = useRef<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showMyFoods, setShowMyFoods] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [addDraft, setAddDraft] = useState<FoodDraft>(emptyFoodDraft());
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FoodDraft | null>(null);
  const [editFoodId, setEditFoodId] = useState<string | null>(null);
  const [foodEditDraft, setFoodEditDraft] = useState<LibraryEditDraft | null>(null);
  const [goalsDraft, setGoalsDraft] = useState<NutritionGoals>({ ...DEFAULT_NUTRITION_GOALS });
  const [foodSearch, setFoodSearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [pickedCatalogId, setPickedCatalogId] = useState<string | null>(null);
  const [aiDescribe, setAiDescribe] = useState('');
  const [aiEstimating, setAiEstimating] = useState(false);
  const [aiEstimateError, setAiEstimateError] = useState('');
  const [aiEstimateResult, setAiEstimateResult] = useState<AiFoodEstimateResult | null>(null);
  const [profileForGoals, setProfileForGoals] = useState<ProfileForGoalSuggestion | null>(null);
  const [hasSavedGoals, setHasSavedGoals] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');
  const [barcodeProduct, setBarcodeProduct] = useState<BarcodeLookupResult | null>(null);
  const [barcodeNotFound, setBarcodeNotFound] = useState<BarcodeLookupNotFound | null>(null);
  const [barcodeServingQty, setBarcodeServingQty] = useState('1');
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const fallbackDetailsRef = useRef<HTMLDetailsElement>(null);
  const [scannerError, setScannerError] = useState('');
  const [labelScanning, setLabelScanning] = useState(false);
  const [labelScanError, setLabelScanError] = useState('');

  const totals = useMemo(() => sumMacros(entries), [entries]);
  const grouped = useMemo(() => groupEntriesByMeal(entries), [entries]);
  const weeklySummary = useMemo(
    () => buildWeeklyNutritionSummary(weekEntries, goals, logDate),
    [weekEntries, goals, logDate]
  );

  const goalSuggestion = useMemo(
    () => suggestNutritionGoals(profileForGoals, profileForGoals?.experience_level),
    [profileForGoals]
  );

  const showGoalSuggestionBanner =
    goalSuggestion.canSuggest && (!hasSavedGoals || goalsMatchDefaults(goals));

  const filteredFoods = useMemo(() => {
    const q = foodSearch.trim().toLowerCase();
    return (savedFoods || [])
      .filter((f) => !f.is_archived)
      .filter((f) => !q || String(f.name || '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [savedFoods, foodSearch]);

  const catalogMatches = useMemo(
    () => searchFoodCatalog(foodCatalog, catalogSearch, 12),
    [foodCatalog, catalogSearch]
  );

  const catalogMatchCount = useMemo(
    () => countFoodCatalogMatches(foodCatalog, catalogSearch),
    [foodCatalog, catalogSearch]
  );

  const activeTemplates = useMemo(
    () => (mealTemplates || []).filter((t) => !t.is_archived),
    [mealTemplates]
  );

  const notifyParent = useCallback(() => {
    onDataChange?.();
  }, [onDataChange]);

  const setDate = useCallback(
    (next: string) => {
      if (next !== logDate) {
        const current = parseYmd(logDate).getTime();
        const target = parseYmd(next).getTime();
        setDayAnimDir(target > current ? 'forward' : target < current ? 'back' : 'none');
        setEntries([]);
        setShowAdd(false);
        setShowMyFoods(false);
        setShowGoals(false);
      }
      setLogDate(next);
      onDateChange?.(next);
    },
    [logDate, onDateChange]
  );

  const loadData = useCallback(async () => {
    if (!userId) return;
    const isInitial = !hasLoadedRef.current;
    if (isInitial) setLoading(true);
    else setDayRefreshing(true);
    setError('');
    const { monday, sunday } = currentCalendarWeekBounds(parseYmd(logDate));
    try {
      const [entriesRes, weekRes, goalsRes, profileRes, foodsRes, templatesRes, catalogRes] = await Promise.all([
        supabase
          .from('st_meal_entries')
          .select('*')
          .eq('user_id', userId)
          .eq('log_date', logDate)
          .order('created_at', { ascending: true }),
        supabase
          .from('st_meal_entries')
          .select('log_date,calories,protein_g,carbs_g,fat_g')
          .eq('user_id', userId)
          .gte('log_date', monday)
          .lte('log_date', sunday),
        supabase.from('st_nutrition_goals').select('*').eq('user_id', userId).maybeSingle(),
        supabase
          .from('st_profiles')
          .select('weight_lbs,height_inches,birth_year,sex,primary_goal,experience_level')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('st_food_library')
          .select('*')
          .eq('user_id', userId)
          .eq('is_archived', false)
          .order('name', { ascending: true }),
        supabase
          .from('st_meal_templates')
          .select('*')
          .eq('user_id', userId)
          .eq('is_archived', false)
          .order('name', { ascending: true }),
        supabase
          .from('st_food_catalog')
          .select('*')
          .eq('is_system', true)
          .eq('is_archived', false)
          .order('name', { ascending: true }),
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (weekRes.error) throw weekRes.error;
      if (goalsRes.error) throw goalsRes.error;
      if (profileRes.error) throw profileRes.error;
      if (foodsRes.error) throw foodsRes.error;

      setEntries((entriesRes.data || []) as MealEntry[]);
      setWeekEntries(weekRes.data || []);
      const nextGoals = goalsFromRow(goalsRes.data);
      setGoals(nextGoals);
      setGoalsDraft(nextGoals);
      setHasSavedGoals(!!goalsRes.data);
      setProfileForGoals((profileRes.data as ProfileForGoalSuggestion) || null);
      setSavedFoods((foodsRes.data || []) as FoodLibraryItem[]);
      if (templatesRes.error) {
        if (!String(templatesRes.error.message || '').includes('st_meal_templates')) {
          throw templatesRes.error;
        }
        setMealTemplates([]);
      } else {
        setMealTemplates(
          (templatesRes.data || [])
            .map(parseMealTemplate)
            .filter(Boolean) as MealTemplate[]
        );
      }
      if (catalogRes.error) {
        if (!String(catalogRes.error.message || '').includes('st_food_catalog')) {
          throw catalogRes.error;
        }
        setFoodCatalog([]);
      } else {
        setFoodCatalog((catalogRes.data || []) as FoodCatalogItem[]);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load nutrition data.');
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      setDayRefreshing(false);
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
    setHasSavedGoals(true);
    setShowGoals(false);
    notifyParent();
    await loadData();
  }

  function applySuggestedGoals() {
    if (!goalSuggestion.canSuggest) return;
    setGoalsDraft(applyGoalSuggestion(goalSuggestion));
    setShowGoals(true);
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
    setShowGoals(false);
    notifyParent();
    await loadData();
  }

  async function insertMealRows(rows: any[]) {
    const { data, error: insertError } = await supabase.from('st_meal_entries').insert(rows).select();
    if (insertError) throw insertError;
    return (data || []) as MealEntry[];
  }

  async function addFoodEntry(fromLibrary?: FoodLibraryItem, qty = 1, meal?: MealType, fromCatalog?: FoodCatalogItem) {
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
    let catalogId: string | null = pickedCatalogId;
    const servingQty = Math.max(
      0.25,
      parseMacroInput(fromCatalog || fromLibrary ? qty : addDraft.serving_qty) || 1
    );

    if (fromCatalog) {
      foodName = foodCatalogLabel(fromCatalog);
      catalogId = fromCatalog.id;
      libraryId = null;
      macros = scaleMacros(fromCatalog, servingQty);
    } else if (fromLibrary) {
      foodName = fromLibrary.name;
      libraryId = fromLibrary.id;
      catalogId = null;
      macros = scaleMacros(fromLibrary, servingQty);
    } else {
      if (!foodName) return alert('Enter a food name.');
      catalogId = pickedCatalogId;
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

    try {
      if (!fromLibrary && !fromCatalog && addDraft.saveToLibrary && foodName) {
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
        if (libError) throw libError;
        if (libRow) {
          libraryId = libRow.id;
          setSavedFoods((prev) =>
            [...prev, libRow as FoodLibraryItem].sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      }

      const inserted = await insertMealRows([
        {
          user_id: userId,
          log_date: logDate,
          meal_type: mealType,
          food_name: foodName,
          food_library_id: libraryId,
          food_catalog_id: catalogId,
          serving_qty: servingQty,
          ...macros,
        },
      ]);
      setEntries((prev) => [...prev, ...inserted]);
      setWeekEntries((prev) => [
        ...prev,
        ...inserted.map((row) => ({
          log_date: row.log_date,
          calories: row.calories,
          protein_g: row.protein_g,
          carbs_g: row.carbs_g,
          fat_g: row.fat_g,
        })),
      ]);
      if (!fromLibrary && !fromCatalog) {
        setAddDraft(emptyFoodDraft(mealType));
        setCatalogSearch('');
        setPickedCatalogId(null);
        closeAddFood();
      }
      notifyParent();
    } catch (e: any) {
      setError(e?.message || 'Could not log food.');
    } finally {
      setSaving(false);
    }
  }

  function openEditEntry(entry: MealEntry) {
    const per = entryToPerServing(entry);
    setEditEntryId(entry.id);
    setEditDraft({
      meal_type: entry.meal_type,
      food_name: per.food_name,
      serving_qty: String(per.serving_qty),
      calories: String(per.calories),
      protein_g: String(per.protein_g),
      carbs_g: String(per.carbs_g),
      fat_g: String(per.fat_g),
      saveToLibrary: false,
    });
    setShowAdd(false);
  }

  async function saveEditedEntry() {
    if (!userId || !editEntryId || !editDraft) return;
    const built = mealEntryFromDraft(editDraft, editDraft.meal_type);
    if (!built.food_name) return alert('Enter a food name.');

    setSaving(true);
    setError('');
    const { data, error: updateError } = await supabase
      .from('st_meal_entries')
      .update({
        meal_type: editDraft.meal_type,
        food_name: built.food_name,
        serving_qty: built.serving_qty,
        calories: built.calories,
        protein_g: built.protein_g,
        carbs_g: built.carbs_g,
        fat_g: built.fat_g,
      })
      .eq('id', editEntryId)
      .select()
      .single();
    setSaving(false);
    if (updateError) return setError(updateError.message);
    if (data) {
      setEntries((prev) => prev.map((e) => (e.id === editEntryId ? (data as MealEntry) : e)));
      setEditEntryId(null);
      setEditDraft(null);
      notifyParent();
      await loadData();
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Remove this food entry?')) return;
    const { error: delError } = await supabase.from('st_meal_entries').delete().eq('id', id);
    if (delError) return setError(delError.message);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    notifyParent();
    await loadData();
  }

  async function duplicateEntry(entry: MealEntry) {
    if (!userId) return;
    setSaving(true);
    setError('');
    try {
      const inserted = await insertMealRows([
        {
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
        },
      ]);
      setEntries((prev) => [...prev, ...inserted]);
      notifyParent();
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'Could not duplicate entry.');
    } finally {
      setSaving(false);
    }
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
    setError('');
    try {
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
      const inserted = await insertMealRows(rows);
      setEntries((prev) => [...prev, ...inserted]);
      notifyParent();
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'Could not copy yesterday.');
    } finally {
      setSaving(false);
    }
  }

  function openEditFood(food: FoodLibraryItem) {
    setEditFoodId(food.id);
    setFoodEditDraft({
      name: food.name,
      serving_label: food.serving_label || '1 serving',
      calories: String(food.calories),
      protein_g: String(food.protein_g),
      carbs_g: String(food.carbs_g),
      fat_g: String(food.fat_g),
    });
  }

  async function saveEditedFood() {
    if (!editFoodId || !foodEditDraft) return;
    const name = foodEditDraft.name.trim();
    if (!name) return alert('Enter a food name.');
    setSaving(true);
    setError('');
    const { data, error: updateError } = await supabase
      .from('st_food_library')
      .update({
        name,
        serving_label: foodEditDraft.serving_label.trim() || '1 serving',
        calories: parseMacroInput(foodEditDraft.calories),
        protein_g: parseMacroInput(foodEditDraft.protein_g),
        carbs_g: parseMacroInput(foodEditDraft.carbs_g),
        fat_g: parseMacroInput(foodEditDraft.fat_g),
      })
      .eq('id', editFoodId)
      .select()
      .single();
    setSaving(false);
    if (updateError) return setError(updateError.message);
    if (data) {
      setSavedFoods((prev) =>
        prev.map((f) => (f.id === editFoodId ? (data as FoodLibraryItem) : f)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditFoodId(null);
      setFoodEditDraft(null);
    }
  }

  async function archiveFood(id: string) {
    if (!confirm('Archive this saved food? Past meal logs stay unchanged.')) return;
    const { error: updateError } = await supabase
      .from('st_food_library')
      .update({ is_archived: true })
      .eq('id', id);
    if (updateError) return setError(updateError.message);
    setSavedFoods((prev) => prev.filter((f) => f.id !== id));
    if (editFoodId === id) {
      setEditFoodId(null);
      setFoodEditDraft(null);
    }
  }

  async function saveMealAsTemplate(meal: MealType) {
    const mealEntries = grouped[meal];
    if (!mealEntries.length) return alert(`Log items in ${MEAL_TYPE_LABELS[meal]} first.`);
    const defaultName = `${MEAL_TYPE_LABELS[meal]} template`;
    const name = prompt('Template name', defaultName)?.trim();
    if (!name) return;

    setSaving(true);
    setError('');
    const { data, error: insertError } = await supabase
      .from('st_meal_templates')
      .insert({
        user_id: userId,
        name,
        meal_type: meal,
        items: templateItemsFromEntries(mealEntries),
      })
      .select()
      .single();
    setSaving(false);
    if (insertError) return setError(insertError.message);
    const parsed = parseMealTemplate(data);
    if (parsed) {
      setMealTemplates((prev) => [...prev, parsed].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  async function logMealTemplate(template: MealTemplate) {
    if (!template.items.length) return alert('This template has no items.');
    if (!confirm(`Log "${template.name}" (${template.items.length} item(s)) to ${formatDisplayDate(logDate)}?`)) return;

    setSaving(true);
    setError('');
    try {
      const rows = template.items.map((item) => ({
        user_id: userId,
        log_date: logDate,
        meal_type: template.meal_type,
        food_name: item.food_name,
        food_library_id: item.food_library_id || null,
        serving_qty: item.serving_qty,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
      }));
      const inserted = await insertMealRows(rows);
      setEntries((prev) => [...prev, ...inserted]);
      notifyParent();
      await loadData();
    } catch (e: any) {
      setError(e?.message || 'Could not log template.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveTemplate(id: string) {
    if (!confirm('Archive this meal template?')) return;
    const { error: updateError } = await supabase
      .from('st_meal_templates')
      .update({ is_archived: true })
      .eq('id', id);
    if (updateError) return setError(updateError.message);
    setMealTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  function pickCatalogFood(item: FoodCatalogItem) {
    setPickedCatalogId(item.id);
    setAddDraft({
      ...addDraft,
      food_name: foodCatalogLabel(item),
      serving_qty: '1',
      calories: String(item.calories),
      protein_g: String(item.protein_g),
      carbs_g: String(item.carbs_g),
      fat_g: String(item.fat_g),
      saveToLibrary: false,
    });
  }

  function resetAddFoodExtras() {
    setCatalogSearch('');
    setPickedCatalogId(null);
    setAiDescribe('');
    setAiEstimateError('');
    setAiEstimateResult(null);
    setBarcodeValue('');
    setBarcodeLoading(false);
    setBarcodeError('');
    setBarcodeProduct(null);
    setBarcodeNotFound(null);
    setBarcodeServingQty('1');
    setShowBarcodeScanner(false);
    setScannerError('');
    setLabelScanning(false);
    setLabelScanError('');
  }

  function clearBarcodeResults() {
    setBarcodeProduct(null);
    setBarcodeNotFound(null);
    setBarcodeServingQty('1');
    setBarcodeError('');
  }

  function openBarcodeScanner() {
    clearBarcodeResults();
    setScannerError('');
    setShowBarcodeScanner(true);
  }

  function closeBarcodeScanner() {
    setShowBarcodeScanner(false);
    setScannerError('');
  }

  function closeMyFoods() {
    setShowMyFoods(false);
    setFoodSearch('');
  }

  function openMyFoods() {
    setShowAdd(false);
    resetAddFoodExtras();
    setShowMyFoods(true);
  }

  function closeAddFood() {
    setShowAdd(false);
    resetAddFoodExtras();
  }

  function openAddFood(meal: MealType = 'breakfast') {
    setShowMyFoods(false);
    setShowGoals(false);
    setEditEntryId(null);
    setEditDraft(null);
    setEditFoodId(null);
    setFoodEditDraft(null);
    setAddDraft(emptyFoodDraft(meal));
    resetAddFoodExtras();
    setShowAdd(true);
  }

  async function getAuthToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  async function lookupBarcodeProduct(code?: string) {
    const barcode = String(code ?? barcodeValue).trim();
    if (!barcode) {
      setBarcodeError('Enter a valid UPC or EAN barcode.');
      return;
    }
    const token = await getAuthToken();
    if (!token) {
      setBarcodeError('Sign in to look up barcodes.');
      return;
    }

    setBarcodeLoading(true);
    setBarcodeError('');
    clearBarcodeResults();
    setAiEstimateResult(null);
    setAiEstimateError('');
    closeBarcodeScanner();

    try {
      const res = await fetch('/api/nutrition/barcode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ barcode }),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = raw as { error?: string };
        throw new Error(err?.error || `Lookup failed (${res.status})`);
      }
      const data = raw as BarcodeLookupResponse;
      setBarcodeValue(data.barcode || barcode);
      if (!isBarcodeLookupResult(data)) {
        setBarcodeNotFound(data);
        return;
      }
      setBarcodeProduct(data);
      setBarcodeServingQty('1');
    } catch (e: any) {
      setBarcodeError(e?.message || 'Barcode lookup failed.');
    } finally {
      setBarcodeLoading(false);
    }
  }

  function applyBarcodeProductToManual(product: BarcodeLookupResult, qty = barcodeServingQty) {
    setPickedCatalogId(null);
    setAddDraft({
      ...addDraft,
      ...barcodeResultToDraft(product, addDraft.meal_type, parseMacroInput(qty) || 1),
    });
  }

  async function logBarcodeProduct(saveToLibrary: boolean) {
    if (!barcodeProduct || !userId) return;
    const qty = Math.max(0.25, parseMacroInput(barcodeServingQty) || 1);
    const scaled = scaleBarcodeNutrition(barcodeProduct.per_serving, qty);
    const foodName = barcodeDisplayName(barcodeProduct);
    const extra = barcodeExtraNutritionNote(scaled);
    const notes = [barcodeProduct.notes, extra, `Barcode ${barcodeProduct.barcode}`].filter(Boolean).join(' · ');

    setSaving(true);
    setError('');
    let libraryId: string | null = null;

    try {
      if (saveToLibrary) {
        const { data: libRow, error: libError } = await supabase
          .from('st_food_library')
          .insert({
            user_id: userId,
            name: foodName,
            serving_label: barcodeProduct.serving_label,
            calories: scaled.calories,
            protein_g: scaled.protein_g,
            carbs_g: scaled.carbs_g,
            fat_g: scaled.fat_g,
          })
          .select()
          .single();
        if (libError) throw libError;
        if (libRow) {
          libraryId = libRow.id;
          setSavedFoods((prev) =>
            [...prev, libRow as FoodLibraryItem].sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      }

      const inserted = await insertMealRows([
        {
          user_id: userId,
          log_date: logDate,
          meal_type: addDraft.meal_type,
          food_name: foodName,
          food_library_id: libraryId,
          serving_qty: qty,
          calories: scaled.calories,
          protein_g: scaled.protein_g,
          carbs_g: scaled.carbs_g,
          fat_g: scaled.fat_g,
          notes: notes || null,
        },
      ]);
      setEntries((prev) => [...prev, ...inserted]);
      setWeekEntries((prev) => [
        ...prev,
        ...inserted.map((row) => ({
          log_date: row.log_date,
          calories: row.calories,
          protein_g: row.protein_g,
          carbs_g: row.carbs_g,
          fat_g: row.fat_g,
        })),
      ]);
      notifyParent();
      clearBarcodeResults();
    } catch (e: any) {
      setError(e?.message || 'Could not log scanned food.');
    } finally {
      setSaving(false);
    }
  }

  function openManualBarcodeFallback() {
    clearBarcodeResults();
    if (fallbackDetailsRef.current) fallbackDetailsRef.current.open = true;
    window.setTimeout(() => document.getElementById('barcode-input')?.focus(), 0);
  }

  function focusLabelPhotoInput() {
    if (fallbackDetailsRef.current) fallbackDetailsRef.current.open = true;
    document.getElementById('label-photo-input')?.click();
  }

  async function scanNutritionLabel(file: File | null) {
    if (!file) return;
    const token = await getAuthToken();
    if (!token) return alert('Sign in to scan nutrition labels.');

    setLabelScanning(true);
    setLabelScanError('');
    setAiEstimateResult(null);
    setAiEstimateError('');
    clearBarcodeResults();
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      const image_base64 = btoa(binary);
      const mime_type = file.type || 'image/jpeg';
      const res = await fetch('/api/nutrition/scan-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image_base64, mime_type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Label scan failed (${res.status})`);
      setAiEstimateResult(data as AiFoodEstimateResult);
      setPickedCatalogId(null);
      if ((data as AiFoodEstimateResult)?.items?.length === 1) {
        setAddDraft({
          ...addDraft,
          ...aiEstimateToDraft((data as AiFoodEstimateResult).items[0], addDraft.meal_type),
        });
      }
    } catch (e: any) {
      setLabelScanError(e?.message || 'Could not read nutrition label.');
    } finally {
      setLabelScanning(false);
    }
  }

  async function estimateWithAi() {
    const description = aiDescribe.trim();
    if (description.length < 4) return alert('Describe your food (e.g. 6 oz chicken breast and rice).');
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return alert('Sign in to use AI food estimates.');

    setAiEstimating(true);
    setAiEstimateError('');
    setAiEstimateResult(null);
    setLabelScanError('');
    setBarcodeError('');
    clearBarcodeResults();
    try {
      const res = await fetch('/api/nutrition/estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ description, meal_type: addDraft.meal_type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Estimate failed (${res.status})`);
      setAiEstimateResult(data as AiFoodEstimateResult);
      if ((data as AiFoodEstimateResult)?.items?.length === 1) {
        setPickedCatalogId(null);
        setAddDraft({
          ...addDraft,
          ...aiEstimateToDraft((data as AiFoodEstimateResult).items[0], addDraft.meal_type),
        });
      }
    } catch (e: any) {
      setAiEstimateError(e?.message || 'Could not estimate food.');
    } finally {
      setAiEstimating(false);
    }
  }

  function applyAiEstimate(item: AiFoodEstimateItem) {
    setPickedCatalogId(null);
    setAddDraft({
      ...addDraft,
      ...aiEstimateToDraft(item, addDraft.meal_type),
    });
  }

  async function logAiEstimates(items: AiFoodEstimateItem[]) {
    if (!userId || !items.length) return;
    setSaving(true);
    setError('');
    const notePrefix = aiEstimateResult?.notes ? `AI estimate: ${aiEstimateResult.notes}` : 'AI estimate';
    try {
      const rows = items.map((item) => ({
        user_id: userId,
        log_date: logDate,
        meal_type: addDraft.meal_type,
        food_name: item.food_name,
        serving_qty: 1,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        notes: notePrefix,
      }));
      const inserted = await insertMealRows(rows);
      setEntries((prev) => [...prev, ...inserted]);
      notifyParent();
      await loadData();
      closeAddFood();
    } catch (e: any) {
      setError(e?.message || 'Could not log AI estimate.');
    } finally {
      setSaving(false);
    }
  }

  function shiftDate(days: number) {
    const d = new Date(`${logDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  function onDaySwipeStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    daySwipeStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onDaySwipeCancel() {
    daySwipeStart.current = null;
  }

  function onDaySwipeEnd(e: React.TouchEvent) {
    const start = daySwipeStart.current;
    daySwipeStart.current = null;
    if (!start || dayRefreshing) return;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Require a deliberate horizontal swipe on the dashboard rings area.
    if (absX < 96) return;
    if (absY > 40) return;
    if (absX < absY * 1.75) return;

    shiftDate(deltaX > 0 ? -1 : 1);
  }

  const dayPanelClass = `nutrition-day-view nutrition-day-view--${dayAnimDir}${
    dayRefreshing ? ' is-refreshing' : ''
  }`;

  return (
    <section className="nutrition-tracker">
      {loading ? (
        <div className="card nutrition-summary-card">
          <div className="topline nutrition-summary-head">
            <h2>Daily nutrition</h2>
            <span className="badge">{formatDisplayDate(logDate)}</span>
          </div>
          <p className="muted">Loading nutrition log...</p>
        </div>
      ) : (
          <div key={logDate} className={dayPanelClass}>
            <div className="card nutrition-summary-card">
              <div
                className="nutrition-dashboard-swipe"
                onTouchStart={onDaySwipeStart}
                onTouchEnd={onDaySwipeEnd}
                onTouchCancel={onDaySwipeCancel}
              >
                <div className="topline nutrition-summary-head">
                  <h2>Daily nutrition</h2>
                  <div className="nutrition-date-nav">
                    <button
                      type="button"
                      className="btn small secondary nutrition-date-arrow"
                      onClick={() => shiftDate(-1)}
                      aria-label="Previous day"
                      disabled={dayRefreshing}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="btn small secondary nutrition-date-arrow"
                      onClick={() => shiftDate(1)}
                      aria-label="Next day"
                      disabled={dayRefreshing}
                    >
                      ›
                    </button>
                    <span className="badge">{formatDisplayDate(logDate)}</span>
                  </div>
                </div>
                <NutritionMacroDashboard totals={totals} goals={goals} />
              </div>
              <div className="actions nutrition-summary-actions">
                <button type="button" className="btn green" onClick={() => openAddFood()} disabled={saving}>
                  Add food
                </button>
                <button type="button" className="btn secondary" onClick={() => setShowGoals(true)} disabled={saving}>
                  Edit goals
                </button>
                <button type="button" className="btn secondary" onClick={copyYesterday} disabled={saving}>
                  Copy yesterday
                </button>
                <button type="button" className="btn secondary" onClick={openMyFoods} disabled={saving}>
                  My foods
                </button>
              </div>
              {error && <p className="nutrition-error">{error}</p>}
            </div>

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
            <button type="button" className="btn secondary" onClick={applySuggestedGoals} disabled={saving}>
              Review & edit
            </button>
          </div>
        </div>
      )}

      {showGoals && (
        <div className="card nutrition-goals-card">
          <h3>Daily macro goals</h3>
          {goalSuggestion.canSuggest && (
            <div className="nutrition-goals-suggest-inline">
              <p className="muted">{goalSuggestion.summary}</p>
              <div className="actions" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => setGoalsDraft(applyGoalSuggestion(goalSuggestion))}
                  disabled={saving}
                >
                  Fill from profile suggestion
                </button>
              </div>
            </div>
          )}
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
        <div className="panel-overlay" onClick={closeAddFood}>
          <div
            className="nutrition-add-panel card nutrition-add-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="nutrition-add-title"
          >
            <div className="topline" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 id="nutrition-add-title">Add food · {MEAL_TYPE_LABELS[addDraft.meal_type]}</h3>
              <button type="button" className="btn small secondary" onClick={closeAddFood}>
                Close
              </button>
            </div>
            <p className="muted nutrition-add-intro">
              Tap <b>Scan Barcode</b> to use your rear camera on iPhone or Android. Fallback options appear if the
              product is not found.
            </p>

          <div className="catalog-picker nutrition-scan-picker">
            <h4 className="nutrition-add-section-title">Packaged food</h4>

            {!showBarcodeScanner && !barcodeProduct && !barcodeNotFound && (
              <div className="actions" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="btn green"
                  onClick={openBarcodeScanner}
                  disabled={saving || barcodeLoading}
                >
                  Scan Barcode
                </button>
              </div>
            )}

            {barcodeLoading && (
              <p className="muted nutrition-barcode-loading">Looking up product in Open Food Facts…</p>
            )}

            {showBarcodeScanner && (
              <NutritionBarcodeScanner
                onDetected={(code) => {
                  setBarcodeValue(code);
                  lookupBarcodeProduct(code);
                }}
                onClose={closeBarcodeScanner}
                onError={(code, message) => setScannerError(message)}
              />
            )}

            {scannerError && !showBarcodeScanner && <p className="nutrition-error">{scannerError}</p>}
            {barcodeError && <p className="nutrition-error">{barcodeError}</p>}

            {barcodeProduct && (
              <NutritionBarcodeProductCard
                product={barcodeProduct}
                mealType={addDraft.meal_type}
                servingQty={barcodeServingQty}
                onServingQtyChange={setBarcodeServingQty}
                saving={saving}
                onLog={logBarcodeProduct}
                onReviewManual={() => applyBarcodeProductToManual(barcodeProduct)}
              />
            )}

            {barcodeNotFound && (
              <NutritionBarcodeNotFoundCard
                result={barcodeNotFound}
                onScanAgain={openBarcodeScanner}
                onEnterManualUpc={openManualBarcodeFallback}
                onLabelPhoto={focusLabelPhotoInput}
                onManualEntry={() => {
                  clearBarcodeResults();
                  document.getElementById('add-name')?.focus();
                }}
                onSaveCustom={() => {
                  setAddDraft({
                    ...emptyFoodDraft(addDraft.meal_type),
                    food_name: barcodeNotFound.barcode
                      ? `Custom item (${barcodeNotFound.barcode})`
                      : 'Custom packaged food',
                    saveToLibrary: true,
                  });
                  clearBarcodeResults();
                }}
              />
            )}

            {!showBarcodeScanner && !barcodeProduct && !barcodeNotFound && (
              <details className="nutrition-barcode-fallback" ref={fallbackDetailsRef}>
                <summary>Fallback options</summary>
                <p className="muted nutrition-scan-hint">
                  Use these only if live scanning is unavailable or the product was not found.
                </p>
                <label htmlFor="barcode-input">Enter UPC / EAN manually</label>
                <div className="nutrition-barcode-row">
                  <input
                    id="barcode-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={barcodeValue}
                    onChange={(e) => setBarcodeValue(e.target.value.replace(/\D/g, ''))}
                    placeholder="UPC / EAN barcode"
                  />
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => lookupBarcodeProduct()}
                    disabled={saving || barcodeLoading}
                  >
                    Look up
                  </button>
                </div>
                <label htmlFor="label-photo-input" className="nutrition-label-upload">
                  Photograph nutrition label
                </label>
                <input
                  id="label-photo-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  capture="environment"
                  disabled={saving || labelScanning}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    scanNutritionLabel(file);
                    e.target.value = '';
                  }}
                />
                <p className="muted nutrition-ai-disclaimer">{LABEL_OCR_DISCLAIMER}</p>
                {labelScanError && <p className="nutrition-error">{labelScanError}</p>}
                {labelScanning && <p className="muted">Reading nutrition label…</p>}
              </details>
            )}
          </div>

          <div className="catalog-picker nutrition-catalog-picker">
            <h4 className="nutrition-add-section-title">Food catalog</h4>
            <label htmlFor="catalog-search">Search food catalog</label>
            <input
              id="catalog-search"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder={
                foodCatalog.length
                  ? `Search ${foodCatalog.length} common foods (e.g. chicken, rice, yogurt)`
                  : 'Search common foods (run BIQ-0036 migration for catalog)'
              }
            />
            {foodCatalog.length > 0 && (
              <p className="muted nutrition-catalog-meta">
                {catalogSearch.trim()
                  ? `${catalogMatchCount} match${catalogMatchCount === 1 ? '' : 'es'}`
                  : 'Type to search or enter food manually below'}
              </p>
            )}
            {catalogMatches.length > 0 && (
              <div className="catalog-results">
                {catalogMatches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`catalog-result${pickedCatalogId === item.id ? ' picked' : ''}`}
                    onClick={() => pickCatalogFood(item)}
                  >
                    <span>
                      <b>{foodCatalogLabel(item)}</b>
                      <span className="muted">
                        {foodCatalogMeta(item)} · {item.calories} cal · {item.protein_g}P · {item.carbs_g}C ·{' '}
                        {item.fat_g}F
                      </span>
                    </span>
                    <span className="badge">Use</span>
                  </button>
                ))}
              </div>
            )}
            {catalogSearch.trim() && catalogMatches.length === 0 && foodCatalog.length > 0 && (
              <p className="muted">No catalog matches. Enter the food manually below.</p>
            )}
          </div>

          <div className="catalog-picker nutrition-ai-picker">
            <h4 className="nutrition-add-section-title">AI estimate</h4>
            <label htmlFor="ai-food-describe">Describe your food (AI estimate)</label>
            <textarea
              id="ai-food-describe"
              rows={2}
              value={aiDescribe}
              onChange={(e) => setAiDescribe(e.target.value)}
              placeholder="e.g. 6 oz grilled chicken breast with 1 cup rice and broccoli"
            />
            <p className="muted nutrition-ai-disclaimer">{AI_FOOD_DISCLAIMER}</p>
            <div className="actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn secondary"
                onClick={estimateWithAi}
                disabled={saving || aiEstimating}
              >
                {aiEstimating ? 'Estimating...' : 'Estimate with AI'}
              </button>
            </div>
            {aiEstimateError && <p className="nutrition-error">{aiEstimateError}</p>}
            {aiEstimateResult && (
              <div className="nutrition-ai-results">
                {aiEstimateResult.notes && (
                  <p className="dash-insight nutrition-ai-notes">{aiEstimateResult.notes}</p>
                )}
                <div className="nutrition-food-grid">
                  {aiEstimateResult.items.map((item, idx) => (
                    <div key={`${item.food_name}-${idx}`} className="nutrition-food-chip">
                      <div>
                        <b>{item.food_name}</b>
                        <span className="muted">
                          {item.serving_label} · {formatMacroLine(item)}
                        </span>
                      </div>
                      <div className="nutrition-food-chip-actions">
                        <button
                          type="button"
                          className="btn small secondary"
                          onClick={() => applyAiEstimate(item)}
                          disabled={saving}
                        >
                          Use
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {aiEstimateResult.items.length > 1 && (
                  <button
                    type="button"
                    className="btn small green"
                    style={{ marginTop: 8 }}
                    onClick={() => logAiEstimates(aiEstimateResult.items)}
                    disabled={saving}
                  >
                    Log all {aiEstimateResult.items.length} items
                  </button>
                )}
              </div>
            )}
          </div>

          <h4 className="nutrition-add-section-title">Manual entry</h4>
          <FoodFormFields
            draft={addDraft}
            setDraft={(next) => {
              const manualEdit =
                !!pickedCatalogId &&
                (next.food_name !== addDraft.food_name ||
                  next.calories !== addDraft.calories ||
                  next.protein_g !== addDraft.protein_g ||
                  next.carbs_g !== addDraft.carbs_g ||
                  next.fat_g !== addDraft.fat_g);
              setAddDraft(next);
              if (manualEdit) setPickedCatalogId(null);
            }}
            idPrefix="add"
            showSaveToLibrary
          />
          <div className="actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn green" onClick={() => addFoodEntry()} disabled={saving}>
              {saving ? 'Saving...' : `Log to ${MEAL_TYPE_LABELS[addDraft.meal_type]}`}
            </button>
            <button type="button" className="btn secondary" onClick={closeAddFood}>
              Cancel
            </button>
          </div>
          </div>
        </div>
      )}

      {showMyFoods && (
        <div className="panel-overlay" onClick={closeMyFoods}>
          <div
            className="nutrition-add-panel card nutrition-my-foods-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="nutrition-my-foods-title"
          >
            <div className="topline" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 id="nutrition-my-foods-title">My foods</h3>
              <button type="button" className="btn small secondary" onClick={closeMyFoods}>
                Close
              </button>
            </div>
            <MyFoodsPanel
              foodSearch={foodSearch}
              setFoodSearch={setFoodSearch}
              foods={filteredFoods}
              saving={saving}
              onEdit={(food) => {
                closeMyFoods();
                openEditFood(food);
              }}
              onAddToMeal={(food, meal) => addFoodEntry(food, 1, meal)}
            />
          </div>
        </div>
      )}

      {editEntryId && editDraft && (
        <div className="card nutrition-add-card">
          <h3>Edit food entry</h3>
          <FoodFormFields draft={editDraft} setDraft={setEditDraft} idPrefix="edit" />
          <div className="actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn green" onClick={saveEditedEntry} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setEditEntryId(null);
                setEditDraft(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
                        onClick={() => openEditEntry(entry)}
                        disabled={saving}
                      >
                        Edit
                      </button>
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
            <div className="actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => openAddFood(meal)}
              >
                + Add to {MEAL_TYPE_LABELS[meal]}
              </button>
              {mealEntries.length > 0 && (
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => saveMealAsTemplate(meal)}
                  disabled={saving}
                >
                  Save as template
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="card nutrition-library-card">
        <h3>Meal templates</h3>
        <p className="muted">Save a logged meal as a template, then log the whole meal in one tap.</p>
        {activeTemplates.length === 0 ? (
          <p className="muted">No templates yet. Use &ldquo;Save as template&rdquo; on a meal section above.</p>
        ) : (
          <div className="nutrition-template-grid">
            {activeTemplates.map((template) => {
              const templateTotals = sumMacros(template.items);
              return (
                <div key={template.id} className="nutrition-template-chip">
                  <div>
                    <b>{template.name}</b>
                    <span className="muted">
                      {MEAL_TYPE_LABELS[template.meal_type]} · {template.items.length} item(s) ·{' '}
                      {formatMacroLine(templateTotals)}
                    </span>
                  </div>
                  <div className="nutrition-food-chip-actions">
                    <button
                      type="button"
                      className="btn small green"
                      onClick={() => logMealTemplate(template)}
                      disabled={saving}
                    >
                      Log today
                    </button>
                    <button
                      type="button"
                      className="btn small red"
                      onClick={() => archiveTemplate(template.id)}
                      disabled={saving}
                    >
                      Archive
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editFoodId && foodEditDraft && (
        <div className="card nutrition-add-card">
          <h3>Edit saved food</h3>
          <label htmlFor="food-edit-name">Name</label>
          <input
            id="food-edit-name"
            value={foodEditDraft.name}
            onChange={(e) => setFoodEditDraft({ ...foodEditDraft, name: e.target.value })}
          />
          <label htmlFor="food-edit-serving">Serving label</label>
          <input
            id="food-edit-serving"
            value={foodEditDraft.serving_label}
            onChange={(e) => setFoodEditDraft({ ...foodEditDraft, serving_label: e.target.value })}
          />
          <div className="row">
            <div>
              <label htmlFor="food-edit-cal">Calories</label>
              <input
                id="food-edit-cal"
                type="number"
                min="0"
                value={foodEditDraft.calories}
                onChange={(e) => setFoodEditDraft({ ...foodEditDraft, calories: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="food-edit-protein">Protein g</label>
              <input
                id="food-edit-protein"
                type="number"
                min="0"
                value={foodEditDraft.protein_g}
                onChange={(e) => setFoodEditDraft({ ...foodEditDraft, protein_g: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div>
              <label htmlFor="food-edit-carbs">Carbs g</label>
              <input
                id="food-edit-carbs"
                type="number"
                min="0"
                value={foodEditDraft.carbs_g}
                onChange={(e) => setFoodEditDraft({ ...foodEditDraft, carbs_g: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="food-edit-fat">Fat g</label>
              <input
                id="food-edit-fat"
                type="number"
                min="0"
                value={foodEditDraft.fat_g}
                onChange={(e) => setFoodEditDraft({ ...foodEditDraft, fat_g: e.target.value })}
              />
            </div>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn green" onClick={saveEditedFood} disabled={saving}>
              {saving ? 'Saving...' : 'Save food'}
            </button>
            <button type="button" className="btn red" onClick={() => archiveFood(editFoodId)} disabled={saving}>
              Archive
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setEditFoodId(null);
                setFoodEditDraft(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

            <NutritionWeeklySummary
              summary={weeklySummary}
              activeDate={logDate}
              onSelectDate={setDate}
            />
          </div>
      )}
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
