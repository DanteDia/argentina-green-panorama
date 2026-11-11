// Countries for the profile's nationality and residence. Calls state eligibility by ISO code; artists shouldn't have to know one.
export const COUNTRIES: [code: string, name: string][] = [
  ["AR", "Argentina"], ["UY", "Uruguay"], ["CL", "Chile"], ["PY", "Paraguay"], ["BO", "Bolivia"], ["BR", "Brasil"], ["PE", "Perú"], ["CO", "Colombia"],
  ["EC", "Ecuador"], ["VE", "Venezuela"], ["MX", "México"], ["CU", "Cuba"], ["DO", "República Dominicana"], ["PR", "Puerto Rico"], ["CR", "Costa Rica"],
  ["PA", "Panamá"], ["GT", "Guatemala"], ["HN", "Honduras"], ["SV", "El Salvador"], ["NI", "Nicaragua"], ["HT", "Haití"], ["JM", "Jamaica"], ["TT", "Trinidad y Tobago"],
  ["ES", "España"], ["IT", "Italia"], ["FR", "Francia"], ["DE", "Alemania"], ["PT", "Portugal"], ["GB", "Reino Unido"], ["NL", "Países Bajos"], ["BE", "Bélgica"],
  ["CH", "Suiza"], ["AT", "Austria"], ["SE", "Suecia"], ["US", "Estados Unidos"], ["CA", "Canadá"], ["IL", "Israel"], ["JP", "Japón"], ["CN", "China"], ["KR", "Corea del Sur"], ["AU", "Australia"],
];

/** Options for a country select: the list, plus the profile's current code if it is one we don't list (never silently changed). */
export function countryOptions(current: string | null | undefined): [string, string][] {
  const code = (current || "").trim().toUpperCase();
  return !code || COUNTRIES.some(([c]) => c === code) ? COUNTRIES : [...COUNTRIES, [code, code]];
}
