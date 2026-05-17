import type { EdgeType, RegulationEdge } from "../../shared/schema.js";
import {
  EURLEX_SPARQL,
  FROM_YEAR,
  SOURCE_TIMEOUT_MS,
  TO_YEAR,
  USER_AGENT,
} from "../config.js";

const MAX_EDGES = 3000;
const BUDGET_MS = 120_000;

function yearQuery(year: number): string {
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?cf ?ct ?rel WHERE {
  ?a cdm:resource_legal_id_celex ?cf ;
     cdm:work_date_document ?d .
  { ?a cdm:resource_legal_amends_resource_legal ?b . BIND("amends" AS ?rel) }
  UNION { ?a cdm:resource_legal_repeals_resource_legal ?b . BIND("repeals" AS ?rel) }
  UNION { ?a cdm:resource_legal_based_on_resource_legal ?b . BIND("based_on" AS ?rel) }
  ?b cdm:resource_legal_id_celex ?ct .
  FILTER(?d >= "${year}-01-01"^^xsd:date && ?d <= "${year}-12-31"^^xsd:date)
}`;
}

interface Binding {
  [k: string]: { value: string } | undefined;
}

async function fetchYear(year: number): Promise<Binding[]> {
  const url = new URL(EURLEX_SPARQL);
  url.searchParams.set("query", yearQuery(year));
  url.searchParams.set("format", "application/sparql-results+json");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": USER_AGENT,
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      results?: { bindings?: Binding[] };
    };
    return json.results?.bindings ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Collect EUR-Lex amends/repeals/based_on edges *among* the events we already
 * keep (both endpoints must be in `celexSet`). Year-by-year, time-budgeted,
 * failure-tolerant — returns [] so the graph view simply self-degrades.
 */
export async function fetchEurLexEdges(
  celexSet: Set<string>,
): Promise<RegulationEdge[]> {
  const lastYear = Math.min(TO_YEAR, new Date().getUTCFullYear());
  const deadline = Date.now() + BUDGET_MS;
  const seen = new Set<string>();
  const edges: RegulationEdge[] = [];

  for (let year = FROM_YEAR; year <= lastYear; year++) {
    if (Date.now() > deadline || edges.length >= MAX_EDGES) break;
    try {
      for (const b of await fetchYear(year)) {
        const cf = b.cf?.value ?? "";
        const ct = b.ct?.value ?? "";
        const rel = (b.rel?.value ?? "") as EdgeType;
        if (cf === ct || !celexSet.has(cf) || !celexSet.has(ct)) continue;
        const key = `${cf}>${ct}>${rel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from: `eu:${cf}`, to: `eu:${ct}`, type: rel });
        if (edges.length >= MAX_EDGES) break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[eurlex-edges] ${year}: skipped (${msg})`);
    }
  }
  return edges;
}
