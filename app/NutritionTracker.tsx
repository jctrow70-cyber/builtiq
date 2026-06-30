import { useEffect, useMemo, useState } from "react";

type Meal = "Breakfast" | "Lunch" | "Dinner" | "Snacks";
type Tab = "profile" | "dashboard" | "log" | "templates" | "weight" | "week";

type MacroTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type FoodEntry = {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type FoodTemplate = Omit<FoodEntry, "id" | "date" | "meal"> & { id: string };

type WeightEntry = {
  id: string;
  date: string;
  weight: number;
};

const meals: Meal[] = ["Breakfast", "Lunch", "Dinner", "Snacks"];

const defaultTargets: MacroTargets = {
  calories: 2000,
  protein: 145,
  carbs: 169,
  fat: 75,
};

const storageKeys = {
  targets: "exercise_app_nutrition_targets_v1",
  entries: "exercise_app_nutrition_entries_v1",
  templates: "exercise_app_nutrition_templates_v1",
  weights: "exercise_app_nutrition_weights_v1",
};

const legacyKeys = [
  "macroTrackerData",
  "macro_tracker_data",
  "macro_tracker_v2_data",
  "macro_tracker_v3_data",
  "nutrition_entries",
  "nutrition_targets",
];

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeNumber(value: string | number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function tryLegacyMigration() {
  const migrationFlag = "exercise_app_nutrition_migrated_v1";
  if (localStorage.getItem(migrationFlag)) return "";

  for (const key of legacyKeys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);

      if (key === "nutrition_entries" && Array.isArray(parsed)) {
        localStorage.setItem(storageKeys.entries, JSON.stringify(parsed));
        localStorage.setItem(migrationFlag, "true");
        return "Legacy food entries loaded.";
      }

      if (key === "nutrition_targets" && parsed) {
        localStorage.setItem(storageKeys.targets, JSON.stringify(parsed));
        localStorage.setItem(migrationFlag, "true");
        return "Legacy macro targets loaded.";
      }

      if (parsed?.entries && Array.isArray(parsed.entries)) {
        localStorage.setItem(storageKeys.entries, JSON.stringify(parsed.entries));
      }
      if (parsed?.targets) localStorage.setItem(storageKeys.targets, JSON.stringify(parsed.targets));
      if (parsed?.templates && Array.isArray(parsed.templates)) {
        localStorage.setItem(storageKeys.templates, JSON.stringify(parsed.templates));
      }
      if (parsed?.weights && Array.isArray(parsed.weights)) {
        localStorage.setItem(storageKeys.weights, JSON.stringify(parsed.weights));
      }

      localStorage.setItem(migrationFlag, "true");
      return "Legacy data loaded.";
    } catch {
      // Ignore malformed legacy data and continue checking other keys.
    }
  }

  localStorage.setItem(migrationFlag, "true");
  return "";
}

export default function NutritionTracker() {
  const today = getToday();

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [date, setDate] = useState(today);
  const [migrationMessage, setMigrationMessage] = useState("");

  const [targets, setTargets] = useState<MacroTargets>(defaultTargets);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [templates, setTemplates] = useState<FoodTemplate[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);

  const [foodForm, setFoodForm] = useState({
    meal: "Breakfast" as Meal,
    name: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    editingId: "",
  });

  const [weightForm, setWeightForm] = useState({ date: today, weight: "" });

  useEffect(() => {
    setMigrationMessage(tryLegacyMigration());
    setTargets(loadJson(storageKeys.targets, defaultTargets));
    setEntries(loadJson(storageKeys.entries, []));
    setTemplates(loadJson(storageKeys.templates, []));
    setWeights(loadJson(storageKeys.weights, []));
  }, []);

  useEffect(() => localStorage.setItem(storageKeys.targets, JSON.stringify(targets)), [targets]);
  useEffect(() => localStorage.setItem(storageKeys.entries, JSON.stringify(entries)), [entries]);
  useEffect(() => localStorage.setItem(storageKeys.templates, JSON.stringify(templates)), [templates]);
  useEffect(() => localStorage.setItem(storageKeys.weights, JSON.stringify(weights)), [weights]);

  const todaysEntries = entries.filter((entry) => entry.date === date);

  const totals = useMemo(() => {
    return todaysEntries.reduce(
      (sum, entry) => ({
        calories: sum.calories + entry.calories,
        protein: sum.protein + entry.protein,
        carbs: sum.carbs + entry.carbs,
        fat: sum.fat + entry.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [todaysEntries]);

  const weekRows = useMemo(() => {
    const selected = new Date(`${date}T00:00:00`);
    const day = selected.getDay();
    const start = new Date(selected);
    start.setDate(selected.getDate() - day);

    return Array.from({ length: 7 }, (_, index) => {
      const current = new Date(start);
      current.setDate(start.getDate() + index);
      const dayKey = current.toISOString().slice(0, 10);
      const dayEntries = entries.filter((entry) => entry.date === dayKey);
      const total = dayEntries.reduce(
        (sum, entry) => ({
          calories: sum.calories + entry.calories,
          protein: sum.protein + entry.protein,
          carbs: sum.carbs + entry.carbs,
          fat: sum.fat + entry.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
      return { date: dayKey, ...total };
    });
  }, [date, entries]);

  function resetFoodForm() {
    setFoodForm({ meal: "Breakfast", name: "", calories: "", protein: "", carbs: "", fat: "", editingId: "" });
  }

  function saveFoodEntry() {
    if (!foodForm.name.trim()) return;

    const payload = {
      date,
      meal: foodForm.meal,
      name: foodForm.name.trim(),
      calories: safeNumber(foodForm.calories),
      protein: safeNumber(foodForm.protein),
      carbs: safeNumber(foodForm.carbs),
      fat: safeNumber(foodForm.fat),
    };

    if (foodForm.editingId) {
      setEntries(entries.map((entry) => (entry.id === foodForm.editingId ? { ...entry, ...payload } : entry)));
    } else {
      setEntries([{ id: newId(), ...payload }, ...entries]);
    }

    resetFoodForm();
  }

  function editFood(entry: FoodEntry) {
    setActiveTab("log");
    setFoodForm({
      meal: entry.meal,
      name: entry.name,
      calories: String(entry.calories),
      protein: String(entry.protein),
      carbs: String(entry.carbs),
      fat: String(entry.fat),
      editingId: entry.id,
    });
  }

  function deleteFood(id: string) {
    setEntries(entries.filter((entry) => entry.id !== id));
  }

  function saveAsTemplate(entry: FoodEntry) {
    setTemplates([
      { id: newId(), name: entry.name, calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat },
      ...templates,
    ]);
  }

  function addTemplateToToday(template: FoodTemplate, meal: Meal = "Breakfast") {
    setEntries([
      {
        id: newId(),
        date,
        meal,
        name: template.name,
        calories: template.calories,
        protein: template.protein,
        carbs: template.carbs,
        fat: template.fat,
      },
      ...entries,
    ]);
  }

  function saveWeight() {
    if (!weightForm.weight) return;
    setWeights([{ id: newId(), date: weightForm.date, weight: safeNumber(weightForm.weight) }, ...weights]);
    setWeightForm({ date: today, weight: "" });
  }

  const macroCards = (["calories", "protein", "carbs", "fat"] as const).map((key) => {
    const eaten = totals[key];
    const target = targets[key];
    const percent = target > 0 ? Math.min(100, Math.round((eaten / target) * 100)) : 0;
    return { key, eaten, target, remaining: Math.max(target - eaten, 0), percent };
  });

  return (
    <div className="nutrition-tracker">
      <div className="nutrition-header">
        <div>
          <p className="eyebrow">Nutrition</p>
          <h1>Macro Tracker</h1>
          <p className="subtitle">Phase 1 manual tracking. AI, barcode, label, and photo scanning come next.</p>
        </div>
        <input className="date-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

      {migrationMessage && <div className="notice">{migrationMessage}</div>}

      <div className="nutrition-tabs" role="tablist" aria-label="Nutrition sections">
        <button className={activeTab === "profile" ? "active" : ""} onClick={() => setActiveTab("profile")}>👤 Profile</button>
        <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>📊 Dashboard</button>
        <button className={activeTab === "log" ? "active" : ""} onClick={() => setActiveTab("log")}>🍽️ Food Log</button>
        <button className={activeTab === "templates" ? "active" : ""} onClick={() => setActiveTab("templates")}>⭐ Templates</button>
        <button className={activeTab === "weight" ? "active" : ""} onClick={() => setActiveTab("weight")}>⚖️ Weight</button>
        <button className={activeTab === "week" ? "active" : ""} onClick={() => setActiveTab("week")}>📈 Weekly Charts</button>
      </div>

      {activeTab === "profile" && (
        <section className="nutrition-card">
          <h2>Profile / Daily Targets</h2>
          <div className="nutrition-grid four">
            {(["calories", "protein", "carbs", "fat"] as const).map((key) => (
              <label key={key}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
                <input type="number" value={targets[key]} onChange={(event) => setTargets({ ...targets, [key]: safeNumber(event.target.value) })} />
              </label>
            ))}
          </div>
        </section>
      )}

      {activeTab === "dashboard" && (
        <section>
          <div className="nutrition-grid four">
            {macroCards.map((card) => (
              <div className="nutrition-card macro-card" key={card.key}>
                <h3>{card.key.toUpperCase()}</h3>
                <div className="macro-total">{card.eaten} / {card.target}</div>
                <div className="progress"><span style={{ width: `${card.percent}%` }} /></div>
                <p>{card.remaining} remaining</p>
              </div>
            ))}
          </div>

          <div className="nutrition-card">
            <h2>Today&apos;s Meals</h2>
            {meals.map((meal) => (
              <div className="meal-summary" key={meal}>
                <strong>{meal}</strong>
                <span>{todaysEntries.filter((entry) => entry.meal === meal).length} items</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "log" && (
        <section>
          <div className="nutrition-card">
            <h2>{foodForm.editingId ? "Edit Food" : "Add Food"}</h2>
            <div className="nutrition-grid two">
              <label>Meal<select value={foodForm.meal} onChange={(event) => setFoodForm({ ...foodForm, meal: event.target.value as Meal })}>{meals.map((meal) => <option key={meal}>{meal}</option>)}</select></label>
              <label>Food name<input value={foodForm.name} onChange={(event) => setFoodForm({ ...foodForm, name: event.target.value })} placeholder="Chicken breast, rice, etc." /></label>
            </div>
            <div className="nutrition-grid four">
              <label>Calories<input type="number" value={foodForm.calories} onChange={(event) => setFoodForm({ ...foodForm, calories: event.target.value })} /></label>
              <label>Protein<input type="number" value={foodForm.protein} onChange={(event) => setFoodForm({ ...foodForm, protein: event.target.value })} /></label>
              <label>Carbs<input type="number" value={foodForm.carbs} onChange={(event) => setFoodForm({ ...foodForm, carbs: event.target.value })} /></label>
              <label>Fat<input type="number" value={foodForm.fat} onChange={(event) => setFoodForm({ ...foodForm, fat: event.target.value })} /></label>
            </div>
            <div className="actions"><button onClick={saveFoodEntry}>{foodForm.editingId ? "Save Changes" : "Add Food"}</button>{foodForm.editingId && <button className="secondary" onClick={resetFoodForm}>Cancel</button>}</div>
          </div>

          {meals.map((meal) => (
            <div className="nutrition-card" key={meal}>
              <h2>{meal}</h2>
              {todaysEntries.filter((entry) => entry.meal === meal).length === 0 ? <p className="muted">No foods added.</p> : null}
              {todaysEntries.filter((entry) => entry.meal === meal).map((entry) => (
                <div className="food-row" key={entry.id}>
                  <div><strong>{entry.name}</strong><p>{entry.calories} cal | P {entry.protein}g | C {entry.carbs}g | F {entry.fat}g</p></div>
                  <div className="row-actions"><button onClick={() => editFood(entry)}>Edit</button><button onClick={() => saveAsTemplate(entry)}>Template</button><button className="danger" onClick={() => deleteFood(entry.id)}>Delete</button></div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {activeTab === "templates" && (
        <section className="nutrition-card">
          <h2>Saved Food Templates</h2>
          {templates.length === 0 ? <p className="muted">Save a food from the Food Log to reuse it later.</p> : null}
          {templates.map((template) => (
            <div className="food-row" key={template.id}>
              <div><strong>{template.name}</strong><p>{template.calories} cal | P {template.protein}g | C {template.carbs}g | F {template.fat}g</p></div>
              <div className="row-actions"><button onClick={() => addTemplateToToday(template)}>Add Today</button><button className="danger" onClick={() => setTemplates(templates.filter((item) => item.id !== template.id))}>Delete</button></div>
            </div>
          ))}
        </section>
      )}

      {activeTab === "weight" && (
        <section className="nutrition-card">
          <h2>Weight Tracking</h2>
          <div className="nutrition-grid two">
            <label>Date<input type="date" value={weightForm.date} onChange={(event) => setWeightForm({ ...weightForm, date: event.target.value })} /></label>
            <label>Weight<input type="number" value={weightForm.weight} onChange={(event) => setWeightForm({ ...weightForm, weight: event.target.value })} placeholder="157" /></label>
          </div>
          <button onClick={saveWeight}>Add Weight</button>
          {weights.map((item) => <div className="meal-summary" key={item.id}><strong>{item.date}</strong><span>{item.weight} lb</span></div>)}
        </section>
      )}

      {activeTab === "week" && (
        <section className="nutrition-card">
          <h2>Weekly Charts</h2>
          <div className="weekly-list">
            {weekRows.map((row) => (
              <div className="week-row" key={row.date}>
                <strong>{row.date}</strong>
                <span>{row.calories} cal</span>
                <span>P {row.protein}g</span>
                <span>C {row.carbs}g</span>
                <span>F {row.fat}g</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
