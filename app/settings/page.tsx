import { AppShell } from "@/components/AppShell";

export default function SettingsPage() {
  return (
    <AppShell>
      <h1 className="text-4xl font-black text-slate-950">Settings</h1>
      <div className="card mt-6">
        <h2 className="text-xl font-bold">Connected services</h2>
        <p className="mt-3 text-slate-600">Supabase is configured through Vercel environment variables.</p>
        <code className="mt-4 block rounded-2xl bg-slate-100 p-4 text-sm">
          NEXT_PUBLIC_SUPABASE_URL<br />
          NEXT_PUBLIC_SUPABASE_ANON_KEY
        </code>
      </div>
    </AppShell>
  );
}
