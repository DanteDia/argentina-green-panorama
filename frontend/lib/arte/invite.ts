// Show invitations: who to invite from the artist's scene, and a ready-to-send message.
// Sending happens in the artist's own Gmail / Instagram (compose links), so nothing is sent on their behalf.
import type { Affine } from "./discover";

export interface Show {
  id: string;
  title: string;
  venue: string | null;
  address: string | null;
  when_text: string | null;
  link: string | null;
  note: string | null;
}

export interface Contact { channel: "email" | "instagram" | null; email: string | null; instagram: string | null }
export interface Candidate extends Affine { contact: Contact }

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;   // no separators: Gmail would split them into extra recipients
const HANDLE = /^[a-z0-9._]{1,30}$/;

export function contactOf(info: { email?: unknown; instagram?: unknown } | null | undefined): Contact {
  const str = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  const email = str(info?.email);
  const handle = str(info?.instagram).replace(/^(https?:\/\/)?((www|m)\.)?instagram\.com\//, "").replace(/^@/, "");
  const okEmail = EMAIL.test(email) ? email : null;
  // a bare handle only: "p/XYZ" (a post) or anything with a path is not an account
  const instagram = HANDLE.test(handle.replace(/\/$/, "")) ? handle.replace(/\/$/, "") : null;
  return { channel: okEmail ? "email" : instagram ? "instagram" : null, email: okEmail, instagram };
}

/** Stable identity of an invitee: graph node, else email, else Instagram handle. */
export function inviteKey(x: { nodeId?: string | null; email?: string | null; instagram?: string | null }): string {
  if (x.nodeId) return `node:${x.nodeId}`;
  if (x.email?.trim()) return `email:${x.email.trim().toLowerCase()}`;
  const ig = (x.instagram ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!ig) throw new Error("invite needs a node, an email or an Instagram handle");
  return `ig:${ig}`;
}

/** isPerson=false (galleries, museums…) greets the team by the full name instead of a first name. */
export function inviteText(show: Show, guestName: string, artistName: string, artistLink: string | null, isPerson = true): { subject: string; body: string } {
  const name = guestName.trim();
  const greeting = !name ? "Hola," : isPerson ? `Hola ${name.split(/\s+/)[0]},` : `Hola, equipo de ${name}:`;
  const subject = `${isPerson ? "Te invito a" : "Invitación a"} ${show.title}${show.when_text ? `, ${show.when_text}` : ""}`;
  const where = [show.when_text, show.address].filter(Boolean).join(" · ");
  const lines = [
    greeting,
    "",
    `${isPerson ? "Te quiero invitar" : "Quiero invitarlos"} a ${show.title}${show.venue ? `, en ${show.venue}` : ""}.`,
    where,
    show.note ?? "",
    show.link ?? "",
    "",
    isPerson ? "Me encantaría que vengas." : "Me encantaría que vengan.",
    "",
    artistName,
    artistLink ?? "",
  ];
  // drop empty optional lines, keeping the deliberate blank separators (never two in a row)
  const body = lines.filter((l, i) => l !== "" || (lines[i - 1] !== "" && i > 0)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { subject, body };
}

export function gmailComposeUrl({ to, subject, body }: { to: string; subject: string; body: string }): string {
  const q = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${q}`;
}

export const instagramDmUrl = (handle: string) => `https://ig.me/m/${encodeURIComponent(handle)}`;

/** Scene suggestions you can actually reach, best first, minus people already invited to this show. */
export function inviteCandidates(
  groups: Affine[][],
  rows: Map<string, { contact_info?: { email?: string; instagram?: string } | null }>,
  invited: Set<string>,
): Candidate[] {
  return groups.flat()
    .map((a) => ({ ...a, contact: contactOf(rows.get(a.nodeId)?.contact_info) }))
    // also skip people first invited by hand under the same email or handle
    .filter((c) => c.contact.channel && ![inviteKey({ nodeId: c.nodeId }), c.contact.email && inviteKey({ email: c.contact.email }),
      c.contact.instagram && inviteKey({ instagram: c.contact.instagram })].some((k) => k && invited.has(k)))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
