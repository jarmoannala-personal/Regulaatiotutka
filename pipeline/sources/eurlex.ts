import type { RegulationEvent } from "../../shared/schema.js";
import {
  EURLEX_SPARQL,
  FROM_YEAR,
  SOURCE_TIMEOUT_MS,
  TO_YEAR,
  USER_AGENT,
} from "../config.js";
import { EUROVOC_ALLOW_URIS } from "../normalize/domainMap.js";
import { normalizeEurLex, type EurLexRow } from "../normalize/toEvent.js";

const REG = "<http://publications.europa.eu/resource/authority/resource-type/REG>";
const DIR = "<http://publications.europa.eu/resource/authority/resource-type/DIR>";
const LANG = "http://publications.europa.eu/resource/authority/language";

function yearQuery(year: number): string {
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?celex
       (SAMPLE(?type) AS ?rtype)
       (SAMPLE(?date) AS ?docdate)
       (SAMPLE(?inforce) AS ?ifdate)
       (SAMPLE(?tFi) AS ?titleFi)
       (SAMPLE(?tEn) AS ?titleEn)
       (GROUP_CONCAT(DISTINCT STR(?ev); separator=",") AS ?eurovocs)
WHERE {
  ?w cdm:resource_legal_id_celex ?celex ;
     cdm:work_date_document ?date ;
     cdm:work_has_resource-type ?type ;
     cdm:work_is_about_concept_eurovoc ?ev .
  FILTER(?type IN (${REG}, ${DIR}))
  FILTER(?date >= "${year}-01-01"^^xsd:date && ?date <= "${year}-12-31"^^xsd:date)
  FILTER(?ev IN (${EUROVOC_ALLOW_URIS.join(", ")}))
  OPTIONAL { ?w cdm:resource_legal_date_entry-into-force ?inforce }
  OPTIONAL { ?eFi cdm:expression_belongs_to_work ?w ;
             cdm:expression_uses_language <${LANG}/FIN> ;
             cdm:expression_title ?tFi }
  OPTIONAL { ?eEn cdm:expression_belongs_to_work ?w ;
             cdm:expression_uses_language <${LANG}/ENG> ;
             cdm:expression_title ?tEn }
}
GROUP BY ?celex
ORDER BY ?celex`;
}

interface SparqlBinding {
  [k: string]: { value: string } | undefined;
}

function idsFromConcat(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((u) => u.trim().split("/").pop() ?? "")
    .filter(Boolean);
}

async function fetchYear(year: number): Promise<RegulationEvent[]> {
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
      results?: { bindings?: SparqlBinding[] };
    };
    const bindings = json.results?.bindings ?? [];
    const out: RegulationEvent[] = [];
    for (const b of bindings) {
      const row: EurLexRow = {
        celex: b.celex?.value ?? "",
        resourceType: b.rtype?.value ?? "",
        docDate: b.docdate?.value ?? "",
        inForce: b.ifdate?.value,
        titleFi: b.titleFi?.value,
        titleEn: b.titleEn?.value,
        eurovocIds: idsFromConcat(b.eurovocs?.value),
      };
      const ev = normalizeEurLex(row);
      if (ev) out.push(ev);
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Query CELLAR SPARQL year-by-year (keeps each request small and within the
 * 60s budget). A failing year is logged and skipped; total failure yields []
 * so the orchestrator falls back to the committed seed.
 */
export async function fetchEurLex(): Promise<RegulationEvent[]> {
  const lastYear = Math.min(TO_YEAR, new Date().getUTCFullYear());
  const byId = new Map<string, RegulationEvent>();
  let ok = 0;
  for (let year = FROM_YEAR; year <= lastYear; year++) {
    try {
      const events = await fetchYear(year);
      for (const ev of events) if (!byId.has(ev.id)) byId.set(ev.id, ev);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[eurlex] ${year}: skipped (${msg})`);
    }
  }
  if (ok === 0) {
    throw new Error("all years failed");
  }
  return [...byId.values()];
}
