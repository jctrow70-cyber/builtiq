import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-600 shadow-sm">
          BuiltIQ Fitness Platform
        </p>
        <h1 className="max-w-4xl text-5xl font-black tracking-tight text-slate-950 md:text-7xl">
          Train smarter. Eat better. Track everything.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          A web-first fitness platform for workouts, macros, progress tracking, exercise videos, and AI-assisted food logging.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="btn-primary">Open Dashboard</Link>
          <Link href="/login" className="btn-secondary">Login</Link>
        </div>
      </section>
    </main>
  );
}
