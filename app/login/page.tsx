import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="card w-full max-w-md">
        <h1 className="text-3xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-2 text-slate-600">Supabase authentication placeholder. Connect auth next.</p>
        <form className="mt-6 space-y-4">
          <input className="w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="Email" type="email" />
          <input className="w-full rounded-2xl border border-slate-300 px-4 py-3" placeholder="Password" type="password" />
          <Link href="/dashboard" className="btn-primary block text-center">Continue</Link>
        </form>
      </section>
    </main>
  );
}
