import Link from "next/link";
import { requireUser } from "@/lib/arte/supabase-server";
import { Nav } from "@/components/arte/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 mx-auto max-w-6xl px-3 pt-3 md:px-6">
        <div className="topbar flex items-center gap-2 py-1.5 pl-5 pr-2">
          <Link href="/arte/hoy" className="display shrink-0 text-xl">Arte</Link>
          <Nav />
          <p className="ml-auto hidden max-w-[11rem] shrink-0 truncate pr-3 text-xs muted lg:block">{profile?.name || user.email}</p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
