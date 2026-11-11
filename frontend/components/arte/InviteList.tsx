"use client";
import { useState, useTransition } from "react";
import { markInvited, unmarkInvited } from "@/app/arte/(app)/invitar/actions";
import { VENUES } from "@/lib/arte/discover";
import { contactOf, gmailComposeUrl, inviteText, instagramDmUrl, type Contact, type Show } from "@/lib/arte/invite";

const KIND: Record<string, string> = { galeria: "Galería", museo: "Museo", institucion: "Institución", fundacion: "Fundación", programa: "Programa", artista: "Artista", persona: "Persona", curador: "Curaduría", coleccionista: "Coleccionista", gestor: "Gestión cultural" };

export interface Guest { nodeId: string | null; name: string; kind: string; reasons: string[]; contact: Contact }
export interface Sent { id: string; name: string; email: string | null; instagram: string | null }

function Send({ show, guest, from }: { show: Show; guest: Guest; from: { name: string; link: string | null } }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const [error, setError] = useState(false);
  const { subject, body } = inviteText(show, guest.name, from.name, from.link, !VENUES.has(guest.kind));
  const done = () => start(async () => {
    try { setError(false); await markInvited(show.id, { nodeId: guest.nodeId, name: guest.name, email: guest.contact.email, instagram: guest.contact.instagram }); }
    catch { setError(true); }
  });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {guest.contact.channel === "email" ? (
        <a className="btn btn-primary !py-1.5" target="_blank" rel="noreferrer" href={gmailComposeUrl({ to: guest.contact.email!, subject, body })}>Abrir en Gmail</a>
      ) : (
        // a real link, not window.open after an await: Safari / Instagram's browser block late popups
        <a className="btn btn-primary !py-1.5" target="_blank" rel="noreferrer" href={instagramDmUrl(guest.contact.instagram!)}
          onClick={() => { navigator.clipboard.writeText(body).then(() => setCopied("ok"), () => setCopied("fail")); }}>
          {copied === "ok" ? "Copiado: pegalo en el DM" : "Copiar y abrir DM"}</a>
      )}
      <button type="button" className="btn btn-ghost !py-1.5" disabled={pending} onClick={done}>{pending ? "Guardando…" : "Ya la mandé"}</button>
      {error && <span className="text-sm text-[var(--accent)]">No se pudo guardar, probá de nuevo.</span>}
      {copied === "fail" && <pre className="w-full whitespace-pre-wrap font-[inherit] text-sm text-[var(--ink-2)]">No se pudo copiar; copiá este texto:{"\n\n"}{body}</pre>}
    </div>
  );
}

function Card({ show, guest, from }: { show: Show; guest: Guest; from: { name: string; link: string | null } }) {
  return (
    <li className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="display text-lg leading-snug">{guest.name}</span>
        <span className="shrink-0 text-xs muted">{KIND[guest.kind] ?? guest.kind}{guest.contact.channel === "email" ? " · mail" : ` · @${guest.contact.instagram}`}</span>
      </div>
      {guest.reasons.length > 0 && <ul className="mt-2 space-y-0.5 text-sm">{guest.reasons.slice(0, 2).map((x) => <li key={x} className="flex gap-2"><span className="text-[var(--accent)]">→</span>{x}</li>)}</ul>}
      <Send show={show} guest={guest} from={from} />
    </li>
  );
}

/** Someone outside the scene graph (a collector, a friend): typed by hand. */
function Manual({ show, from }: { show: Show; from: { name: string; link: string | null } }) {
  const [name, setName] = useState("");
  const [to, setTo] = useState("");
  const c = to.includes("@") && !to.startsWith("@") ? contactOf({ email: to }) : contactOf({ instagram: to });
  return (
    <div className="card p-4" data-testid="invitado-manual">
      <p className="text-sm font-medium">Invitar a alguien más</p>
      <p className="text-sm muted">Coleccionistas, amigos o quien no esté en el mapa.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <input className="input" placeholder="Nombre" aria-label="Nombre del invitado" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="mail@ejemplo.com o @instagram" aria-label="Mail o Instagram" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {c.channel && <Send key={to} show={show} from={from} guest={{ nodeId: null, name, kind: "", reasons: [], contact: c }} />}
    </div>
  );
}

function Undo({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-[var(--accent)]">No se pudo</span>}
      <button type="button" className="text-xs underline muted" disabled={pending}
        onClick={() => start(async () => { try { setError(false); await unmarkInvited(id); } catch { setError(true); } })}>{pending ? "…" : "Deshacer"}</button>
    </span>
  );
}

export function InviteList({ show, guests, sent, from }: { show: Show; guests: Guest[]; sent: Sent[]; from: { name: string; link: string | null } }) {
  const preview = inviteText(show, "Nombre", from.name, from.link);
  return (
    <div className="space-y-8">
      <details className="card p-4">
        <summary className="cursor-pointer text-sm">Ver el mensaje que se va a mandar</summary>
        <p className="mt-3 text-sm font-medium">{preview.subject}</p>
        <pre className="mt-2 whitespace-pre-wrap font-[inherit] text-sm text-[var(--ink-2)]">{preview.body}</pre>
      </details>
      <Manual show={show} from={from} />
      <section>
        <h2 className="display text-2xl">Sugeridos de tu escena</h2>
        {guests.length ? (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">{guests.map((g) => <Card key={g.nodeId} show={show} guest={g} from={from} />)}</ul>
        ) : (
          <p className="mt-2 text-sm muted">No encontramos contactos con mail o Instagram en tu escena todavía. Sumá temas en tu perfil o conectá tu Instagram.</p>
        )}
      </section>
      {sent.length > 0 && (
        <section>
          <h2 className="display text-2xl">Ya invitaste ({sent.length})</h2>
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {sent.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{s.name || s.email || `@${s.instagram}`}<span className="muted">{s.email ? ` · ${s.email}` : s.instagram ? ` · @${s.instagram}` : ""}</span></span>
                <Undo id={s.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
