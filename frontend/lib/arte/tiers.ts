// Prestige / career-impact tiers (my call, tunable). A: international reference programs; B: national references.
const A = /guggenheim|rijksakademie|ars electronica|s\+t\+arts|skowhegan|de ateliers|jan van eyck|hisk|delfina|gasworks|studio voltaire|cité internationale|cite internationale|solitude|lacma|prince claus|cifo|bot[ií]n|pivô|pivo|flora ars|bienal ?sur|iscp|whitney|documenta|venice|venecia|lumen prize/i;
const B = /fondo nacional de las artes|\bfna\b|klemm|ita[uú]|braque|sal[oó]n nacional|palais de glace|santander|andreani|ama amoedo|di tella|utdt|medif[eé]|fortabat|proa|malba|moderno|recoleta|arteba|meridiano|volf|liminales|acéfala|acefala|kirchner|centro cultural|bellas artes/i;

export function tier(name: string, organizer: string | null): "A" | "B" | "C" {
  const s = `${name} ${organizer || ""}`;
  return A.test(s) ? "A" : B.test(s) ? "B" : "C";
}
