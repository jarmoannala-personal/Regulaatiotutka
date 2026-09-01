/**
 * Cross-checks the committed seed against its official sources.
 *
 * `validateSeed.ts` checks the *shape* of the seed offline; this checks whether
 * the facts still hold: that every FI statute number resolves in Finlex and
 * every CELEX resolves in CELLAR, and that the dates agree with the source.
 * It cannot verify the hand-written Finnish summaries — those still need a
 * human (or a careful read of the statute text) on every edit.
 *
 * Network-bound and rate-limited, so it is a manual/periodic check
 * (`npm run verify:seed`), not a build step. Exits 1 on any mismatch.
 *
 *   npm run verify:seed              # whole seed
 *   npm run verify:seed -- fi:10/2026 eu:32026L0470   # named ids only
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { RegulationEvent } from "../shared/schema.js";
import {
  EURLEX_SPARQL,
  FINLEX_BASE,
  FINLEX_MAX_BACKOFF_MS,
  FINLEX_MAX_RETRIES,
  FINLEX_SPACING_MS,
  SEED_PATH,
  SOURCE_TIMEOUT_MS,
  USER_AGENT,
} from "./config.js";

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

interface Problem {
  id: string;
  message: string;
}

/** One statute as published (säädöskokoelma), or null when Finlex 404s. */
async function fetchStatute(
  year: string,
  num: string,
): Promise<{ title: string; dateIssued: string } | null> {
  const url = `${FINLEX_BASE}/akn/fi/act/statute/${year}/${num}/fin@`;
  for (let attempt = 0; attempt < FINLEX_MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/xml", "User-Agent": USER_AGENT },
        signal: ctrl.signal,
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, FINLEX_MAX_BACKOFF_MS)
            : Math.min(1000 * 2 ** attempt, FINLEX_MAX_BACKOFF_MS),
        );
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parser.parse(await res.text()) as {
        akomaNtoso?: Record<string, any>;
      };
      const akn = parsed.akomaNtoso ?? {};
      const act = akn.act ?? akn.doc ?? akn.bill;
      const pf = act?.preface?.p ?? {};
      const dates = asArray<Record<string, string>>(
        act?.meta?.identification?.FRBRWork?.FRBRdate,
      );
      return {
        title: textOf(pf.docTitle).replace(/\s+/g, " ").trim(),
        dateIssued:
          dates.find((d) => d["@_name"] === "dateIssued")?.["@_date"] ??
          dates.find((d) => d["@_name"] === "datePublished")?.["@_date"] ??
          "",
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("429 backoff exhausted");
}

async function checkFinnish(events: RegulationEvent[]): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (const e of events) {
    const [num, year] = (e.statuteNumber ?? "").split("/");
    if (!num || !year) {
      problems.push({ id: e.id, message: `unparseable statuteNumber ${e.statuteNumber}` });
      continue;
    }
    let statute: Awaited<ReturnType<typeof fetchStatute>>;
    try {
      statute = await fetchStatute(year, num);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      problems.push({ id: e.id, message: `Finlex unreachable (${msg})` });
      continue;
    }
    if (!statute) {
      problems.push({ id: e.id, message: `no such statute in Finlex: ${e.statuteNumber}` });
      continue;
    }
    if (statute.dateIssued && statute.dateIssued !== e.dateAnnounced) {
      problems.push({
        id: e.id,
        message: `dateAnnounced ${e.dateAnnounced} but Finlex dateIssued ${statute.dateIssued}`,
      });
    }
    // Seed titles carry curated clarifiers ("(alennettu verokanta 13,5 %)"),
    // so only assert that the statute's own first word still appears.
    const firstWord = statute.title.split(" ")[0]?.toLowerCase() ?? "";
    if (firstWord && !e.title.toLowerCase().includes(firstWord)) {
      problems.push({
        id: e.id,
        message: `title "${e.title}" does not look like Finlex "${statute.title}"`,
      });
    }
    await sleep(FINLEX_SPACING_MS);
  }
  return problems;
}

async function checkEu(events: RegulationEvent[]): Promise<Problem[]> {
  const celexes = events.map((e) => e.celex!).filter(Boolean);
  if (celexes.length === 0) return [];
  const query = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT ?celex (SAMPLE(?date) AS ?docdate) WHERE {
  ?w cdm:resource_legal_id_celex ?celex ; cdm:work_date_document ?date .
  FILTER(STR(?celex) IN (${celexes.map((c) => `"${c}"`).join(", ")}))
} GROUP BY ?celex`;

  const url = new URL(EURLEX_SPARQL);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "application/sparql-results+json");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT_MS);
  let bindings: { celex: { value: string }; docdate?: { value: string } }[];
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": USER_AGENT,
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { results?: { bindings?: typeof bindings } };
    bindings = json.results?.bindings ?? [];
  } finally {
    clearTimeout(timer);
  }

  const dateByCelex = new Map(
    bindings.map((b) => [b.celex.value, b.docdate?.value ?? ""]),
  );
  const problems: Problem[] = [];
  for (const e of events) {
    const date = dateByCelex.get(e.celex!);
    if (date === undefined) {
      problems.push({ id: e.id, message: `CELEX ${e.celex} not found in CELLAR` });
    } else if (date && date !== e.dateAnnounced) {
      // CELLAR's work_date_document is the adoption date; the seed follows it
      // so live EU data and seed data sit at the same point on the timeline.
      problems.push({
        id: e.id,
        message: `dateAnnounced ${e.dateAnnounced} but CELLAR document date ${date}`,
      });
    }
  }
  return problems;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seed = JSON.parse(
  await readFile(resolve(repoRoot, SEED_PATH), "utf8"),
) as RegulationEvent[];

const only = new Set(process.argv.slice(2));
const events = only.size > 0 ? seed.filter((e) => only.has(e.id)) : seed;
if (only.size > 0 && events.length !== only.size) {
  const missing = [...only].filter((id) => !seed.some((e) => e.id === id));
  console.error(`[verify-seed] unknown id(s): ${missing.join(", ")}`);
  process.exit(1);
}

const fi = events.filter((e) => e.jurisdiction === "FI");
const eu = events.filter((e) => e.jurisdiction === "EU");
console.log(`[verify-seed] checking ${fi.length} FI + ${eu.length} EU events…`);

const problems = [...(await checkFinnish(fi)), ...(await checkEu(eu))];

if (problems.length > 0) {
  console.error(`[verify-seed] ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p.id}: ${p.message}`);
  process.exit(1);
}
console.log(`[verify-seed] ok: ${events.length} events match their sources`);
