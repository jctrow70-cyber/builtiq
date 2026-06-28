import { AppShell } from "@/components/AppShell";

export default function NutritionPage() {
  return (
    <AppShell>
      <h1 className="text-4xl font-black text-slate-950">Nutrition Tracker</h1>
      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-bold">Quick log</h2>
          <textarea className="mt-4 h-36 w-full rounded-2xl border border-slate-300 p-4" placeholder="Example: 5 oz chicken, plain bun, jalapeños" />
          <div className="mt-4 flex gap-3">
            <button className="btn-primary">Estimate macros</button>
            <button className="btn-secondary">Scan barcode</button>
          </div>
        </div>
        <div className="card">
          <h2 className="text-xl font-bold">Daily targets</h2>
          <div className="mt-4 space-y-3 text-slate-700">
            <p>Calories: 2,300</p>
            <p>Protein: 165g</p>
            <p>Carbs: 230g</p>
            <p>Fat: 70g</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
