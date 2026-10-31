import { requireUser } from "@/lib/arte/supabase-server";
import { loadStudio, signedUrls } from "@/lib/arte/data";
import { ProfileTabs } from "@/components/arte/ProfileTabs";
import { WorkGrid } from "@/components/arte/WorkGrid";

export default async function Obras() {
  const { user, supabase } = await requireUser();
  const { works } = await loadStudio(supabase, user.id);
  const previews = await signedUrls(supabase, works.flatMap((w) => w.images));
  return (
    <div className="max-w-5xl">
      <p className="eyebrow">Perfil</p>
      <h1 className="display mt-2 text-4xl">Obras</h1>
      <p className="mt-2 muted">{works.length} obras · con ficha técnica completa podemos armar cualquier dossier.</p>
      <ProfileTabs />
      <WorkGrid userId={user.id} works={works} previews={previews} />
    </div>
  );
}
