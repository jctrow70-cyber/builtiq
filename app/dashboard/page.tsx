import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Today</p>
        <h1 className="text-4xl font-black text-slate-950">Dashboard</h1>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Calories" value="2,050" note="Target: 2,300 kcal" />
        <MetricCard label="Protein" value="156g" note="Target: 165g" />
        <MetricCard label="Workout" value="Upper" note="60–75 minutes" />
        <MetricCard label="Weight" value="158.2" note="Trend: steady" />
      </div>
      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-bold">Next workout</h2>
          <ul className="mt-4 space-y-3 text-slate-700">
            <li>Mobility: T-spine rotations, band pull-aparts</li>
            <li>Prehab: Face pulls, external rotations</li>
            <li>Power: Med ball slams</li>
            <li>Strength: Bench press, rows, overhead press</li>
          </ul>
        </div>
        <div className="card">
          <h2 className="text-xl font-bold">AI food logging</h2>
          <p className="mt-3 text-slate-600">
            Type or speak a meal such as “5 ounces chicken, plain bun, jalapeños” and the app can estimate calories and macros.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
