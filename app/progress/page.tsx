import { AppShell } from "@/components/AppShell";

export default function ProgressPage() {
  return (
    <AppShell>
      <h1 className="text-4xl font-black text-slate-950">Progress</h1>
      <div className="mt-6 grid gap-5 md:grid-cols-3">
        <div className="card"><h2 className="font-bold">Weight</h2><p className="mt-3 text-3xl font-black">158.2 lb</p></div>
        <div className="card"><h2 className="font-bold">Waist</h2><p className="mt-3 text-3xl font-black">32 in</p></div>
        <div className="card"><h2 className="font-bold">Photos</h2><p className="mt-3 text-slate-600">Progress photo upload placeholder.</p></div>
      </div>
    </AppShell>
  );
}
