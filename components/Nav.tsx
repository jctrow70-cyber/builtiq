import Link from "next/link";
import { Activity, Dumbbell, Utensils, LineChart, Settings } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", icon: Utensils },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function Nav() {
  return (
    <aside className="hidden min-h-screen w-72 border-r border-slate-200 bg-white p-6 lg:block">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">BuiltIQ</p>
        <h1 className="text-2xl font-bold text-slate-900">Fitness Platform</h1>
      </div>
      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-900"
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
