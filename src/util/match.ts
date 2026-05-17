import type { RegulationEvent } from "../../shared/schema";
import type { AppState } from "../state/appState";

/** True if the event is excluded by the active legend facet filters. */
export function isFiltered(
  e: RegulationEvent,
  f: AppState["filters"],
): boolean {
  if (f.domains.length && !f.domains.includes(e.domain)) return true;
  if (f.jurisdictions.length && !f.jurisdictions.includes(e.jurisdiction)) {
    return true;
  }
  if (f.impact.length && !f.impact.includes(e.impactTier)) return true;
  return false;
}

/**
 * Hand-curated aliases bridging the English/acronym ↔ Finnish gap. Each key
 * (a query token *or* the whole query phrase) expands to extra substrings that
 * are also tried. Values are matched against the Finnish title/summary and the
 * CELEX/statute number, so e.g. "gdpr" finds the GDPR even though its official
 * Finnish title contains neither "gdpr" nor English words.
 */
const ALIASES: Record<string, string[]> = {
  gdpr: ["tietosuoja", "2016/679", "32016r0679"],
  "ai act": ["tekoäly", "2024/1689", "32024r1689"],
  ai: ["tekoäly"],
  csrd: ["kestävyysrapor", "2022/2464", "32022l2464"],
  nfrd: ["muiden kuin taloudellisten", "2014/95"],
  dora: ["häiriönsieto", "2022/2554", "32022r2554"],
  mifid: ["rahoitusvälineiden markkinat", "2014/65", "32014l0065"],
  mar: ["markkinoiden väärinkäyt", "596/2014", "32014r0596"],
  psd2: ["maksupalvelu", "2015/2366", "32015l2366"],
  aml: ["rahanpesu"],
  amld: ["rahanpesu"],
  whistleblower: ["ilmoittaja", "1937", "32019l1937"],
  dma: ["digimarkkina", "2022/1925", "32022r1925"],
  csddd: ["yritysvastuu", "2024/1760", "32024l1760"],
  taxonomy: ["luokittelu", "kestävä", "2020/852"],
  atad: ["veron kiert", "2016/1164"],
  cbam: ["hiiliraja", "2023/956"],
  tax: ["vero", "verotus"],
  vat: ["arvonlisävero", "alv"],
  privacy: ["tietosuoja", "yksityisyy"],
  "data protection": ["tietosuoja", "henkilötiet"],
  competition: ["kilpailu"],
  antitrust: ["kilpailu", "määräävä"],
  employment: ["työ", "työsopimu", "työsuhde"],
  labour: ["työ", "työsopimu"],
  labor: ["työ", "työsopimu"],
  environment: ["ympäristö", "jäte", "päästö"],
  environmental: ["ympäristö", "jäte", "päästö"],
  accounting: ["kirjanpito", "tilinpäätös"],
  audit: ["tilintarkast"],
  "company law": ["yhtiöoikeus", "osakeyhti", "yhtiölaki"],
  corporate: ["yhtiö", "osakeyhti"],
  securities: ["arvopaperi", "sijoitus"],
  banking: ["luottolaito", "pankki"],
  directive: ["direktiivi"],
  regulation: ["asetus"],
};

/** Variant substrings to try for one token: the token itself + any aliases. */
function expand(token: string): string[] {
  return ALIASES[token] ? [token, ...ALIASES[token]] : [token];
}

/**
 * Free-text match: case-insensitive. The whole query (and each token) is
 * alias-expanded; every token must match via at least one of its variants
 * (AND across tokens, OR within a token's variants). Empty query matches all.
 */
export function matchesQuery(e: RegulationEvent, query: string): boolean {
  const q = query.toLowerCase().trim().replace(/\s+/g, " ");
  if (q === "") return true;
  const hay = `${e.title} ${e.summary} ${e.statuteNumber ?? ""} ${
    e.celex ?? ""
  }`.toLowerCase();

  // Whole-phrase alias (e.g. "ai act", "data protection").
  if (ALIASES[q]) {
    return [q, ...ALIASES[q]].some((v) => hay.includes(v));
  }
  const tokens = q.split(" ");
  return tokens.every((t) => expand(t).some((v) => hay.includes(v)));
}

/**
 * The combined visibility predicate ANDing legend filters and search.
 * (The timeline cursor gate is applied separately by the radar/feed.)
 */
export function passesFiltersAndQuery(
  e: RegulationEvent,
  state: AppState,
): boolean {
  return !isFiltered(e, state.filters) && matchesQuery(e, state.query);
}
