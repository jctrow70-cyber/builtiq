import { AppShell } from "@/components/AppShell";

const workouts = [
  {
    title: "Lower Body",
    blocks: ["Hip mobility", "Glute med prehab", "Box jumps", "Squat pattern", "Hamstring accessory"]
  },
  {
    title: "Upper Body",
    blocks: ["Shoulder mobility", "Rotator cuff", "Med ball power", "Press / pull strength", "Arm finisher"]
  },
  {
    title: "Total Body",
    blocks: ["Dynamic warmup", "Core activation", "Plyometric circuit", "Functional strength", "Conditioning"]
  }
];

export default function WorkoutsPage() {
  return (
    <AppShell>
      <h1 className="text-4xl font-black text-slate-950">Workout Planner</h1>
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {workouts.map((workout) => (
          <article key={workout.title} className="card">
            <h2 className="text-2xl font-bold">{workout.title}</h2>
            <p className="mt-1 text-sm text-slate-500">60–90 minutes</p>
            <ul className="mt-4 space-y-2 text-slate-700">
              {workout.blocks.map((block) => <li key={block}>• {block}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
