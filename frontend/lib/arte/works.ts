// Bulk upload: several image files become one work each, so an artist can drop a folder and fill the sheets later.

// File names a camera, a phone or a chat app gives: they say nothing about the work, and their date is the photo's, not the work's
const MACHINE = /^(img|dsc|dscn|dscf|pxl|mvimg|image|photo|foto|pic|screenshot|captura|whatsapp image|scan|untitled)?[\s_-]*[\d\s_.:-]*(at [\d.\s]+)?$|^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/** Title and year for a work created from an uploaded file's name. Named files become titles; machine names don't. */
export function workFromFilename(filename: string): { title: string; year: string | null } {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  if (!base || MACHINE.test(base)) return { title: "Obra sin título", year: null };
  const year = base.match(/(?<!\d)(19|20)\d{2}(?!\d)/)?.[0] ?? null;
  const title = base.replace(/\(?(?<!\d)(19|20)\d{2}(?!\d)\)?/, " ").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!title) return { title: "Obra sin título", year: null };
  return { title: (title[0].toUpperCase() + title.slice(1)).slice(0, 120), year };
}
