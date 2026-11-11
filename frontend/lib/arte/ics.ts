// Deadlines as a calendar file (.ics): the artist adds their closings to their own calendar, with reminders,
// instead of depending on opening the app. All-day events, so no time zones are involved.

export interface IcsEvent { uid: string; date: string; title: string; description?: string; url?: string }

const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** RFC 5545 wants lines of at most 75 octets, continued with CRLF + space; folding by 60 characters stays under that with accents. */
const fold = (line: string) => {
  const chars = [...line];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += i ? 59 : 60) out.push((i ? " " : "") + chars.slice(i, i + (i ? 59 : 60)).join(""));
  return out.join("\r\n");
};

export function toIcs(events: IcsEvent[], now: Date): string {
  const stamp = `${ymd(now)}T${now.toISOString().slice(11, 19).replace(/:/g, "")}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IndustriesVerified//Arte//ES", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const start = new Date(`${e.date}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) continue;
    lines.push(
      "BEGIN:VEVENT", `UID:${e.uid}@arte.industriesverified`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(new Date(start.getTime() + 864e5))}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      ...(e.url && /^https?:\/\//i.test(e.url) ? [`URL:${e.url.replace(/[\r\n]/g, "")}`] : []),
      ...["-P7D", "-P2D"].flatMap((t) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:${t}`, "END:VALARM"]),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
