import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { RegulationEvent } from "../shared/schema.js";
import { FINLEX_COOLDOWN_MS, FROM_YEAR, SEED_PATH, TO_YEAR } from "./config.js";
import {
  capEvents,
  dedupeEvents,
  mergeSeed,
  withinCoverage,
} from "./dedupe.js";
import { fetchEurLex } from "./sources/eurlex.js";
import { fetchEurLexEdges } from "./sources/eurlexEdges.js";
import { fetchFinlex, fetchFinlexAmendments } from "./sources/finlex.js";
import { buildDataset, writeDataset } from "./writeDataset.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Run a source, logging and swallowing failure so the build never breaks. */
async function runSource<T>(
  name: string,
  fn: () => Promise<T[]>,
): Promise<T[]> {
  try {
    const items = await fn();
    console.log(`[pipeline] ${name}: ${items.length} items`);
    return items;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[pipeline] ${name}: skipped (${msg})`);
    return [];
  }
}

async function loadSeed(): Promise<RegulationEvent[]> {
  const raw = await readFile(resolve(repoRoot, SEED_PATH), "utf8");
  return JSON.parse(raw) as RegulationEvent[];
}

async function main(): Promise<void> {
  // The two Finlex crawls hit the same rate-limited host, so they run in
  // sequence with a cooldown — in parallel they simply 429 each other out, and
  // back to back the first one's throttling eats the second one whole.
  // Amendments go first: they are the freshest change events and the ones the
  // consolidated set cannot show at all. EUR-Lex is a different service and
  // runs alongside them.
  const [[amendments, finlex], eurlex, seed] = await Promise.all([
    (async () => {
      const amend = await runSource("finlex-amendments", fetchFinlexAmendments);
      await new Promise((r) => setTimeout(r, FINLEX_COOLDOWN_MS));
      return [amend, await runSource("finlex", fetchFinlex)] as const;
    })(),
    runSource("eurlex", fetchEurLex),
    loadSeed(),
  ]);

  // Consolidated first: for a statute present in both sets its metadata is
  // richer (entry into force, ELI), and dedupe keeps the first id it sees.
  const live = dedupeEvents(...[finlex, amendments, eurlex]);
  // The seed is always merged for baseline coverage, and it is the source of
  // truth on the acts it curates: `mergeSeed` keeps its summary, impact tier,
  // domain and title while taking the live record's extra metadata. Seed ids
  // are also never dropped by the size cap.
  const seedIds = new Set(seed.map((e) => e.id));
  const merged = capEvents(
    withinCoverage(mergeSeed(live, seed), FROM_YEAR, TO_YEAR),
    seedIds,
  );

  // The curated summaries are the only written prose in the dataset, and a
  // crawl must never be able to overwrite one again unnoticed.
  const summariesById = new Map(merged.map((e) => [e.id, e.summary]));
  const lostSummaries = seed.filter(
    (e) => summariesById.get(e.id) !== e.summary,
  );
  if (lostSummaries.length > 0) {
    console.warn(
      `[pipeline] curated summaries lost: ${lostSummaries.length}/` +
        `${seed.length} (${lostSummaries.map((e) => e.id).join(", ")})`,
    );
  } else {
    console.log(`[pipeline] curated summaries kept: ${seed.length}/${seed.length}`);
  }

  // What share of the dataset now says something. `excerpt` is the statute's
  // own opening provision, quoted; the rest (EU acts, and FI documents with no
  // usable section) carry no text at all and the UI states that plainly.
  const curated = merged.filter((e) => e.summarySource === "curated").length;
  const excerpts = merged.filter((e) => e.summarySource === "excerpt").length;
  console.log(
    `[pipeline] summaries: ${curated + excerpts}/${merged.length} ` +
      `(${curated} curated, ${excerpts} sourced excerpts)`,
  );

  const origin = live.length > 0 ? "pipeline" : "seed-fallback";
  const sourceVersion = [
    finlex.length ? "finlex-rest-v1" : null,
    amendments.length ? "finlex-saadoskokoelma" : null,
    eurlex.length ? "eurlex-cellar" : null,
    "seed-2026-08",
  ]
    .filter(Boolean)
    .join("+");

  // Experimental: EU legal-relationship edges among the kept events.
  const celexSet = new Set(
    merged
      .filter((e) => e.jurisdiction === "EU" && e.celex)
      .map((e) => e.celex as string),
  );
  let edges: Awaited<ReturnType<typeof fetchEurLexEdges>> = [];
  if (celexSet.size > 0) {
    edges = await runSource("eurlex-edges", () =>
      fetchEurLexEdges(celexSet),
    );
  }

  const dataset = buildDataset(merged, origin, sourceVersion, edges);
  const outPath = await writeDataset(dataset, repoRoot);

  console.log(
    `[pipeline] wrote ${dataset.counts.total} events ` +
      `(FI ${dataset.counts.fi}, EU ${dataset.counts.eu}) ` +
      `${edges.length} edges origin=${origin} -> ${outPath}`,
  );
}

// Never fail the build on data problems: log and exit 0.
main().catch((err) => {
  console.error("[pipeline] fatal:", err);
  process.exitCode = 0;
});
