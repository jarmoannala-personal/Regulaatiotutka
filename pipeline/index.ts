import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { RegulationEvent } from "../shared/schema.js";
import { FROM_YEAR, SEED_PATH, TO_YEAR } from "./config.js";
import { capEvents, dedupeEvents, withinCoverage } from "./dedupe.js";
import { fetchEurLex } from "./sources/eurlex.js";
import { fetchFinlex } from "./sources/finlex.js";
import { buildDataset, writeDataset } from "./writeDataset.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Run a source, logging and swallowing failure so the build never breaks. */
async function runSource(
  name: string,
  fn: () => Promise<RegulationEvent[]>,
): Promise<RegulationEvent[]> {
  try {
    const events = await fn();
    console.log(`[pipeline] ${name}: ${events.length} events`);
    return events;
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
  const [finlex, eurlex, seed] = await Promise.all([
    runSource("finlex", fetchFinlex),
    runSource("eurlex", fetchEurLex),
    loadSeed(),
  ]);

  const live = [...finlex, ...eurlex];
  // Seed is always merged for baseline coverage; live data wins on id clashes.
  const merged = capEvents(
    withinCoverage(dedupeEvents(live, seed), FROM_YEAR, TO_YEAR),
  );

  const origin = live.length > 0 ? "pipeline" : "seed-fallback";
  const sourceVersion = [
    finlex.length ? "finlex-rest-v1" : null,
    eurlex.length ? "eurlex-cellar" : null,
    "seed-2026-05",
  ]
    .filter(Boolean)
    .join("+");

  const dataset = buildDataset(merged, origin, sourceVersion);
  const outPath = await writeDataset(dataset, repoRoot);

  console.log(
    `[pipeline] wrote ${dataset.counts.total} events ` +
      `(FI ${dataset.counts.fi}, EU ${dataset.counts.eu}) ` +
      `origin=${origin} -> ${outPath}`,
  );
}

// Never fail the build on data problems: log and exit 0.
main().catch((err) => {
  console.error("[pipeline] fatal:", err);
  process.exitCode = 0;
});
