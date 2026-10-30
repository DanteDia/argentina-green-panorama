import Link from "next/link";
import { requireUser } from "@/lib/arte/supabase-server";
import { Nav } from "@/components/arte/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r border-[var(--line)] px-5 py-5 md:min-h-screen">
        <Link href="/arte/hoy" className="display text-xl">Arte</Link>
        <p className="mt-1 text-xs muted truncate">{profile?.name || user.email}</p>
        <Nav />
      </aside>
      <main className="px-5 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
