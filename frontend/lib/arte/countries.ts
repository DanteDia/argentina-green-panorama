// Countries for the profile's nationality and residence. Calls state eligibility by ISO code; artists shouldn't have to know one.

// ISO 3166-1 alpha-2. Names come from the runtime (Intl.DisplayNames, in Spanish), so no translated list to maintain.
const CODES = ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ "
  + "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP "
  + "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM "
  + "PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ "
  + "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" ");

const names = new Intl.DisplayNames(["es"], { type: "region" });

/** [code, name in Spanish], Argentina first and the rest alphabetically. */
export const COUNTRIES: [code: string, name: string][] = CODES
  .map((c): [string, string] => [c, names.of(c) ?? c])
  .sort((a, b) => (a[0] === "AR" ? -1 : b[0] === "AR" ? 1 : a[1].localeCompare(b[1], "es")));

/** The code as stored and compared everywhere: trimmed, upper-case. Empty when there is none. */
export const countryCode = (v: string | null | undefined) => (v || "").trim().toUpperCase();

/** Options for a country select: the list, plus the profile's current value if it is not a code we know (never silently changed). */
export function countryOptions(current: string | null | undefined): [string, string][] {
  const code = countryCode(current);
  return !code || COUNTRIES.some(([c]) => c === code) ? COUNTRIES : [...COUNTRIES, [code, code]];
}
