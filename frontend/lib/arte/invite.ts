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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactOf(info: { email?: string | null; instagram?: string | null } | null | undefined): Contact {
  const email = info?.email?.trim().toLowerCase() || null;
  const instagram = info?.instagram?.trim().replace(/^@/, "").toLowerCase() || null;
  const okEmail = email && EMAIL.test(email) ? email : null;
  return { channel: okEmail ? "email" : instagram ? "instagram" : null, email: okEmail, instagram };
}

/** Stable identity of an invitee: graph node, else email, else Instagram handle. */
export function inviteKey(x: { nodeId?: string | null; email?: string | null; instagram?: string | null }): string {
  if (x.nodeId) return `node:${x.nodeId}`;
  if (x.email) return `email:${x.email.trim().toLowerCase()}`;
  return `ig:${(x.instagram ?? "").trim().replace(/^@/, "").toLowerCase()}`;
}

export function inviteText(show: Show, guestName: string, artistName: string, artistLink: string | null): { subject: string; body: string } {
  const first = guestName.trim().split(/\s+/)[0];
  const subject = `Te invito a ${show.title}${show.when_text ? `, ${show.when_text}` : ""}`;
  const where = [show.when_text, show.address].filter(Boolean).join(" · ");
  const lines = [
    first ? `Hola ${first},` : "Hola,",
    "",
    `Te quiero invitar a ${show.title}${show.venue ? `, en ${show.venue}` : ""}.`,
    where,
    show.note ?? "",
    show.link ?? "",
    "",
    "Me encantaría que vengas.",
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
    .filter((c) => c.contact.channel && !invited.has(inviteKey({ nodeId: c.nodeId })))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
