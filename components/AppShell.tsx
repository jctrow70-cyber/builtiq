import { Nav } from "./Nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen">
      <Nav />
      <section className="flex-1 p-5 md:p-8">
        {children}
      </section>
    </main>
  );
}
