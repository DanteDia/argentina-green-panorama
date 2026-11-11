// Deadlines as a calendar file (.ics): the artist adds their closings to their own calendar, with reminders,
// instead of depending on opening the app. All-day events, so no time zones are involved.

export interface IcsEvent { uid: string; date: string; title: string; description?: string; url?: string }

/** Text for a property value. Line breaks of any kind become an escaped "\n" and other control characters are dropped,
 *  so a program name can never start a new line of the file. */
const esc = (t: string) =>
  t.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[\u0000-\u001f\u007f]/g, "").replace(/,/g, "\\,").replace(/;/g, "\\;");
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const bytes = (t: string) => new TextEncoder().encode(t).length;

/** RFC 5545: lines of at most 75 octets, continued on the next line after a space. Counted in bytes, never splitting a character. */
const fold = (line: string) => {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (bytes(cur) + bytes(ch) > 75) { out.push(cur); cur = " "; }
    cur += ch;
  }
  return [...out, cur].join("\r\n");
};

/** Null when no event has a real date (a calendar with no events is not a valid file). */
export function toIcs(events: IcsEvent[], now: Date): string | null {
  const stamp = `${ymd(now)}T${now.toISOString().slice(11, 19).replace(/:/g, "")}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IndustriesVerified//Arte//ES", "CALSCALE:GREGORIAN"];
  let n = 0;
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const start = new Date(`${e.date}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) continue;
    n++;
    lines.push(
      "BEGIN:VEVENT", `UID:${e.uid}@arte.industriesverified`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(new Date(start.getTime() + 864e5))}`,
      `SUMMARY:${esc(e.title)}`, "TRANSP:TRANSPARENT",   // a deadline doesn't make the day busy
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      ...(e.url && /^https?:\/\//i.test(e.url) ? [`URL:${e.url.replace(/[\u0000-\u001f\u007f]/g, "")}`] : []),
      // An all-day event starts at 00:00, so these fire at 9:00 a week before and two days before.
      // The week-before one goes first: some calendar apps keep only the first alarm.
      ...["-P6DT15H", "-P1DT15H"].flatMap((t) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:${t}`, "END:VALARM"]),
      "END:VEVENT",
    );
  }
  if (!n) return null;
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
