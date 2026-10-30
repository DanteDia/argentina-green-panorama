import { requireUser } from "@/lib/arte/supabase-server";

export default async function Hoy() {
  const { profile } = await requireUser();
  return (
    <div>
      <p className="eyebrow">Hoy</p>
      <h1 className="display mt-2 text-4xl">Hola{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}.</h1>
      <p className="mt-2 muted">Tu tablero se arma a medida que completás tu perfil.</p>
    </div>
  );
}
