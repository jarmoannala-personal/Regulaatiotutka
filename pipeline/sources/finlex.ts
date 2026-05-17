import { XMLParser } from "fast-xml-parser";
import type { RegulationEvent } from "../../shared/schema.js";
import {
  FINLEX_BASE,
  FINLEX_BUDGET_MS,
  FINLEX_MAX_PAGES_PER_YEAR,
  FINLEX_PAGE_LIMIT,
  FINLEX_SPACING_MS,
  FROM_YEAR,
  SOURCE_TIMEOUT_MS,
  TO_YEAR,
  USER_AGENT,
} from "../config.js";
import { normalizeFinlex, type FinlexItem } from "../normalize/toEvent.js";

const SEARCH_URL = `${FINLEX_BASE}/akn/fi/act/statute-consolidated`;

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

async function fetchPage(
  year: number,
  page: number,
): Promise<Record<string, unknown>[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("startYear", String(year));
  url.searchParams.set("endYear", String(year));
  url.searchParams.set("langAndVersion", "fin@");
  url.searchParams.set("sortBy", "dateIssued");
  url.searchParams.set("limit", String(FINLEX_PAGE_LIMIT));
  url.searchParams.set("page", String(page));

  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/xml", "User-Agent": USER_AGENT },
        signal: ctrl.signal,
      });
      if (res.status === 429) {
        await sleep(500 * 2 ** attempt);
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

/**
 * Page Finnish consolidated statutes year-by-year, keyword-map to a domain,
 * drop out-of-scope statutes. Per-year paging is capped (the endpoint returns
 * full bodies) — live Finlex is bonus breadth on top of the committed seed.
 * A failing year is logged and skipped; total failure yields [].
 */
export async function fetchFinlex(): Promise<RegulationEvent[]> {
  const lastYear = Math.min(TO_YEAR, new Date().getUTCFullYear());
  const byId = new Map<string, RegulationEvent>();
  const deadline = Date.now() + FINLEX_BUDGET_MS;
  let ok = 0;

  for (let year = FROM_YEAR; year <= lastYear; year++) {
    if (Date.now() > deadline) {
      console.warn(`[finlex] time budget reached, stopping at ${year}`);
      break;
    }
    try {
      for (let page = 1; page <= FINLEX_MAX_PAGES_PER_YEAR; page++) {
        if (Date.now() > deadline) break;
        const nodes = await fetchPage(year, page);
        if (nodes.length === 0) break;
        for (const n of nodes) {
          const item = toItem(n);
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
      console.warn(`[finlex] ${year}: skipped (${msg})`);
    }
  }
  if (ok === 0) throw new Error("all years failed");
  return [...byId.values()];
}
