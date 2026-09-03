import type { RegulationEvent } from "../../shared/schema.js";
import { plausibleDate } from "../../shared/schema.js";
import { computeImpactTier } from "./impact.js";
import { domainFromEurovoc, domainFromTitle } from "./domainMap.js";

/** Base EU legal-act CELEX, e.g. 32016R0679 / 32019L1937 (no corrigenda). */
const BASE_CELEX = /^3\d{4}[LR]\d{4}$/;

/** Decode stray XML char-refs Finlex leaves in titles (e.g. `&#13;`). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function shorten(text: string, max = 280): string {
  // Decode entities first, then fold all whitespace/controls into spaces.
  const t = decodeEntities(text).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s\S*$/, "") + "…";
}

export interface EurLexRow {
  celex: string;
  resourceType: string; // authority URI ending /REG or /DIR
  docDate: string; // yyyy-mm-dd
  inForce?: string; // yyyy-mm-dd
  titleFi?: string;
  titleEn?: string;
  eurovocIds: string[]; // numeric ids
}

/** EU work -> RegulationEvent, or null if it should be skipped. */
export function normalizeEurLex(row: EurLexRow): RegulationEvent | null {
  if (!BASE_CELEX.test(row.celex)) return null;
  const title = (row.titleFi || row.titleEn || "").trim();
  if (!title) return null;

  const domain =
    domainFromEurovoc(row.eurovocIds) ?? domainFromTitle(title);
  if (!domain) return null;

  const instrumentType = row.resourceType.endsWith("/DIR")
    ? "directive"
    : "regulation";

  return {
    id: `eu:${row.celex}`,
    title: shorten(title, 200),
    jurisdiction: "EU",
    domain,
    impactTier: computeImpactTier(instrumentType, undefined, title, "eu"),
    dateAnnounced: row.docDate,
    dateInForce: plausibleDate(row.inForce),
    sourceUrl: `https://eur-lex.europa.eu/legal-content/FI/TXT/?uri=CELEX:${row.celex}`,
    // CELLAR publishes no abstract and the act's own text is a separate
    // multi-megabyte document, so an EU act arrives with nothing to say beyond
    // its title. Empty, not the title again: the UI says so honestly.
    summary: "",
    instrumentType,
    celex: row.celex,
    domainConfidence: domainFromEurovoc(row.eurovocIds) ? "tagged" : "keyword",
  };
}

export interface FinlexItem {
  statuteNumber: string; // "624/2006"
  title: string;
  dateIssued: string; // yyyy-mm-dd
  dateInForce?: string;
  isAmendment: boolean;
  amendedSections?: string[];
  eli?: string;
  /** Finlex typeStatute refersTo, stripped of '#': "act" | "decree" | … */
  statuteType?: string;
  /** Verbatim quote of the statute's opening provision, from its own text. */
  excerpt?: { text: string; ref: string };
}

/** FI consolidated statute -> RegulationEvent, or null if out of scope. */
export function normalizeFinlex(item: FinlexItem): RegulationEvent | null {
  const title = item.title.trim();
  if (!title) return null;
  const domain = domainFromTitle(title);
  if (!domain) return null; // out of company-relevant scope

  const instrumentType = item.isAmendment ? "amendment" : "act";
  const impactKind =
    item.statuteType === "act"
      ? "fi-act"
      : item.statuteType === "decree"
        ? "fi-decree"
        : "fi-other";
  const [num, year] = item.statuteNumber.split("/");
  // Current finlex.fi URL scheme. The older /fi/laki/{ajantasa,alkup}/… paths
  // only 308-redirect here, so link to the canonical target directly.
  const path = item.isAmendment
    ? `lainsaadanto/saadoskokoelma/${year}/${num}`
    : `lainsaadanto/${year}/${num}`;

  return {
    id: `fi:${item.statuteNumber}`,
    title: shorten(title, 200),
    jurisdiction: "FI",
    domain,
    impactTier: computeImpactTier(
      instrumentType,
      item.amendedSections,
      title,
      impactKind,
    ),
    dateAnnounced: item.dateIssued,
    dateInForce: plausibleDate(item.dateInForce),
    sourceUrl: `https://www.finlex.fi/fi/${path}`,
    // The crawl cannot write a summary, but the statute can: `excerpt` is the
    // act's own opening provision, quoted verbatim from the Finlex text the
    // search endpoint already returns. Acts whose document carries no usable
    // section (notices, treaty acts) get nothing rather than their title back.
    summary: item.excerpt ? shorten(item.excerpt.text) : "",
    ...(item.excerpt
      ? {
          summarySource: "excerpt" as const,
          ...(item.excerpt.ref ? { summaryRef: item.excerpt.ref } : {}),
        }
      : {}),
    instrumentType,
    statuteNumber: item.statuteNumber,
    ...(item.eli ? { eli: item.eli } : {}),
    ...(item.amendedSections?.length
      ? { amendedSections: item.amendedSections }
      : {}),
    domainConfidence: "keyword",
  };
}
