import { XMLParser } from "fast-xml-parser";
import type { RegulationEvent } from "../../shared/schema.js";
import {
  FINLEX_AMENDMENT_BUDGET_MS,
  FINLEX_AMENDMENT_MAX_PAGES_PER_YEAR,
  FINLEX_AMENDMENT_YEARS,
  FINLEX_BASE,
  FINLEX_BUDGET_MS,
  FINLEX_MAX_BACKOFF_MS,
  FINLEX_MAX_PAGES_PER_YEAR,
  FINLEX_MAX_RETRIES,
  FINLEX_PAGE_LIMIT,
  FINLEX_SPACING_MS,
  FROM_YEAR,
  SOURCE_TIMEOUT_MS,
  TO_YEAR,
  USER_AGENT,
} from "../config.js";
import { normalizeFinlex, type FinlexItem } from "../normalize/toEvent.js";

/** Ajantasainen text. New statutes only — amendments are folded into the
 *  consolidated act and never appear here as their own document. */
const CONSOLIDATED_URL = `${FINLEX_BASE}/akn/fi/act/statute-consolidated`;
/** Säädöskokoelma: statutes as published, which is where amending acts
 *  ("Laki X:n muuttamisesta") live. */
const STATUTE_URL = `${FINLEX_BASE}/akn/fi/act/statute`;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const asArray = <T>(v: T | T[] | undefined): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in v) {
    return String((v as { "#text": unknown })["#text"]);
  }
  return "";
}

/** Concatenate every string leaf under a parsed node (for body-text regexes). */
function collectText(node: unknown, out: string[] = [], depth = 0): string {
  if (depth > 40) return out.join(" ");
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
  } else if (Array.isArray(node)) {
    for (const v of node) collectText(v, out, depth + 1);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("@_")) continue; // attributes are metadata, not text
      collectText(v, out, depth + 1);
    }
  }
  return out.join(" ");
}

const MONTHS: Record<string, string> = {
  tammikuuta: "01",
  helmikuuta: "02",
  maaliskuuta: "03",
  huhtikuuta: "04",
  toukokuuta: "05",
  kesäkuuta: "06",
  heinäkuuta: "07",
  elokuuta: "08",
  syyskuuta: "09",
  lokakuuta: "10",
  marraskuuta: "11",
  joulukuuta: "12",
};

/**
 * Read the entry-into-force date out of the statute's own closing formula
 * ("Tämä laki tulee voimaan 1 päivänä tammikuuta 2026").
 *
 * Säädöskokoelma documents carry no `inForce` metadata — only the consolidated
 * set does — so for amendments this sentence is the only machine-readable
 * source. Returns undefined for the open-ended form ("…päivänä, jona…").
 */
export function parseInForceDate(text: string): string | undefined {
  const m =
    /tulee\s+voimaan\s+(\d{1,2})\s*päivänä\s+(\p{L}+)\s+(\d{4})/iu.exec(text);
  if (!m) return undefined;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return undefined;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

/**
 * Pull the amended §§ and chapters out of an amending statute's title, e.g.
 * "Laki kilpailulain 44 a ja 47 §:n muuttamisesta" -> ["44 a §", "47 §"].
 * Display-only ("Muutetut kohdat" in the detail panel) and a weak input to the
 * impact heuristic, so a miss is harmless — an over-eager parse is not.
 */
export function parseAmendedSections(title: string): string[] {
  // Number lists tagged with their unit, in the order they appear:
  // "6 luvun 18 ja 45 §:n sekä 9 luvun 6 ja 13 §:n" -> 6:18, 6:45, 9:6, 9:13.
  const ref = /((?:\d+\s*[a-zA-Z]?\s*(?:,|ja|sekä)\s+)*\d+\s*[a-zA-Z]?)\s*(luvun|§)/g;
  const split = (list: string): string[] =>
    list
      .split(/\s*(?:,|\bja\b|\bsekä\b)\s*/)
      .map((n) => n.trim().replace(/\s+/g, "")) // "44 a" -> "44a"
      .filter(Boolean);

  const out: string[] = [];
  let chapters: string[] = [];
  for (const m of title.matchAll(ref)) {
    const numbers = split(m[1]);
    if (m[2] === "luvun") {
      // A chapter list not consumed by a following § stands on its own.
      for (const c of chapters) out.push(`${c} luku`);
      chapters = numbers;
      continue;
    }
    // Chapter:section only when the chapter is unambiguous.
    if (chapters.length === 1) {
      for (const s of numbers) out.push(`${chapters[0]}:${s}`);
    } else {
      out.push(...numbers);
    }
    chapters = [];
  }
  for (const c of chapters) out.push(`${c} luku`);
  return [...new Set(out)];
}

/** Pull one statute's fields out of its parsed <akomaNtoso> node. */
function toItem(node: Record<string, unknown>): FinlexItem | null {
  const act = (node.act ?? node.doc ?? node.bill) as
    | Record<string, any>
    | undefined;
  if (!act?.meta) return null;

  const work = act.meta.identification?.FRBRWork;
  const prop = act.meta.proprietary ?? {};
  const pf = act.preface?.p ?? {};

  const statuteNumber = textOf(pf.docNumber).trim(); // "58/2018"
  const title = textOf(pf.docTitle).replace(/\s+/g, " ").trim();
  if (!/^\d+[a-z]?\/\d{4}$/i.test(statuteNumber) || !title) return null;

  const dates = asArray<Record<string, string>>(work?.FRBRdate);
  const issued =
    dates.find((d) => d["@_name"] === "dateIssued")?.["@_date"] ??
    dates.find((d) => d["@_name"] === "datePublished")?.["@_date"];
  if (!issued) return null;

  const eif = prop.inForce?.dateEntryIntoForce?.["@_date"] as
    | string
    | undefined;
  const eli = work?.FRBRalias?.["@_value"] as string | undefined;
  const statuteType = (
    prop.typeStatute?.["@_refersTo"] as string | undefined
  )?.replace(/^#/, "");

  return {
    statuteNumber,
    title,
    dateIssued: issued,
    dateInForce: eif,
    // statute-consolidated is the current consolidated text, not an amendment.
    isAmendment: false,
    ...(eli ? { eli } : {}),
    ...(statuteType ? { statuteType } : {}),
  };
}

/** Amending acts of parliament only, from the säädöskokoelma. */
const AMENDING_TITLE = /muuttamisesta|kumoamisesta/i;

function toAmendmentItem(node: Record<string, unknown>): FinlexItem | null {
  const base = toItem(node);
  if (!base) return null;
  // Acts of parliament ("Laki …") only: the säädöskokoelma is dominated by
  // ministry decrees and notices that would swamp the radar.
  if (!/^laki\s/i.test(base.title)) return null;
  if (!AMENDING_TITLE.test(base.title)) return null;

  const act = (node.act ?? node.doc ?? node.bill) as Record<string, any>;
  const inForce = base.dateInForce ?? parseInForceDate(collectText(act?.body));
  const sections = parseAmendedSections(base.title);

  return {
    ...base,
    isAmendment: true,
    statuteType: base.statuteType ?? "act",
    ...(inForce ? { dateInForce: inForce } : {}),
    ...(sections.length ? { amendedSections: sections } : {}),
  };
}

async function fetchPage(
  searchUrl: string,
  year: number,
  page: number,
): Promise<Record<string, unknown>[]> {
  const url = new URL(searchUrl);
  url.searchParams.set("startYear", String(year));
  url.searchParams.set("endYear", String(year));
  url.searchParams.set("langAndVersion", "fin@");
  url.searchParams.set("sortBy", "dateIssued");
  url.searchParams.set("limit", String(FINLEX_PAGE_LIMIT));
  url.searchParams.set("page", String(page));

  for (let attempt = 0; attempt < FINLEX_MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/xml", "User-Agent": USER_AGENT },
        signal: ctrl.signal,
      });
      if (res.status === 429) {
        // Finlex throttles hard; a sub-second backoff just burns the retries
        // and skips whole years. Honour Retry-After when it is sent.
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, FINLEX_MAX_BACKOFF_MS)
          : Math.min(1000 * 2 ** attempt, FINLEX_MAX_BACKOFF_MS);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const parsed = parser.parse(xml) as {
        AknXmlList?: { Results?: { akomaNtoso?: unknown } };
      };
      return asArray(
        parsed.AknXmlList?.Results?.akomaNtoso,
      ) as Record<string, unknown>[];
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("429 backoff exhausted");
}

interface CrawlOptions {
  label: string;
  searchUrl: string;
  fromYear: number;
  maxPagesPerYear: number;
  budgetMs: number;
  /** Node -> item, or null to skip (out of scope for this crawl). */
  toItem: (node: Record<string, unknown>) => FinlexItem | null;
}

/**
 * Page one Finlex document set year-by-year, newest year first, and normalize.
 *
 * Newest-first matters: when the wall-clock budget runs out (Finlex throttles
 * hard), the years we lose should be the oldest ones, not this year's law.
 * A failing year is logged and skipped; total failure throws so the caller
 * falls back to the committed seed.
 */
async function crawl(opts: CrawlOptions): Promise<RegulationEvent[]> {
  const lastYear = Math.min(TO_YEAR, new Date().getUTCFullYear());
  const byId = new Map<string, RegulationEvent>();
  const deadline = Date.now() + opts.budgetMs;
  let ok = 0;

  for (let year = lastYear; year >= opts.fromYear; year--) {
    if (Date.now() > deadline) {
      console.warn(`[${opts.label}] time budget reached, stopping at ${year}`);
      break;
    }
    try {
      for (let page = 1; page <= opts.maxPagesPerYear; page++) {
        if (Date.now() > deadline) break;
        const nodes = await fetchPage(opts.searchUrl, year, page);
        if (nodes.length === 0) break;
        for (const n of nodes) {
          const item = opts.toItem(n);
          if (!item) continue;
          const ev = normalizeFinlex(item); // null if out of scope
          if (ev && !byId.has(ev.id)) byId.set(ev.id, ev);
        }
        if (nodes.length < FINLEX_PAGE_LIMIT) break;
        await sleep(FINLEX_SPACING_MS);
      }
      ok++;
      await sleep(FINLEX_SPACING_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[${opts.label}] ${year}: skipped (${msg})`);
    }
  }
  if (ok === 0) throw new Error("all years failed");
  return [...byId.values()];
}

/**
 * Finnish consolidated statutes, keyword-mapped to a domain, out-of-scope
 * statutes dropped. Live Finlex is bonus breadth on top of the committed seed.
 */
export function fetchFinlex(): Promise<RegulationEvent[]> {
  return crawl({
    label: "finlex",
    searchUrl: CONSOLIDATED_URL,
    fromYear: FROM_YEAR,
    maxPagesPerYear: FINLEX_MAX_PAGES_PER_YEAR,
    budgetMs: FINLEX_BUDGET_MS,
    toItem,
  });
}

/**
 * Recent amending acts of parliament from the säädöskokoelma — the change
 * events the consolidated set cannot show. Limited to the last
 * {@link FINLEX_AMENDMENT_YEARS} years: that is where "what changed lately"
 * lives, and a full-history crawl of ~1500 statutes/year is not affordable.
 */
export function fetchFinlexAmendments(): Promise<RegulationEvent[]> {
  const lastYear = Math.min(TO_YEAR, new Date().getUTCFullYear());
  return crawl({
    label: "finlex-amendments",
    searchUrl: STATUTE_URL,
    fromYear: Math.max(FROM_YEAR, lastYear - FINLEX_AMENDMENT_YEARS + 1),
    maxPagesPerYear: FINLEX_AMENDMENT_MAX_PAGES_PER_YEAR,
    budgetMs: FINLEX_AMENDMENT_BUDGET_MS,
    toItem: toAmendmentItem,
  });
}
