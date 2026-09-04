/**
 * Guarantee that {@link OUTPUT_PATH} exists *without* crawling.
 *
 * Data freshness is a function of time, not of when someone edits a
 * stylesheet, so a code-only build has no business re-running the ~9 min
 * pipeline: the säädöskokoelma crawl is throttle-bound and best-effort, and
 * re-rolling it on an unrelated push can publish *less* data than is already
 * live (worst case a `seed-fallback` banner). This runs as `prebuild` instead,
 * and resolves the dataset in order:
 *
 *   1. the local file, if a previous run already produced one;
 *   2. the copy on a live mirror (the deployed sites serve it verbatim);
 *   3. the pipeline, as the last resort on a cold checkout.
 *
 * `npm run build:all` is the explicit "refresh the data first" path, and is
 * what the monthly schedule runs.
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { OUTPUT_PATH } from "./config.js";
import { describe, loadPublishedDataset, outPath } from "./published.js";

/** Atomic write, matching `writeDataset`. */
async function write(raw: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  await writeFile(tmpPath, raw, "utf8");
  await rename(tmpPath, outPath);
}

async function main(): Promise<void> {
  const found = await loadPublishedDataset("ensure-data");
  if (found) {
    const where = found.source === "local" ? `existing ${OUTPUT_PATH}` : found.source;
    console.log(`[ensure-data] using ${where} — ${describe(found.dataset)}`);
    if (found.source !== "local") await write(found.raw);
    return;
  }

  // Cold checkout with every mirror unreachable: crawl. Costs ~9 min, but it
  // is the only remaining way to produce a dataset, and the pipeline itself
  // degrades to the committed seed rather than failing.
  console.log("[ensure-data] no dataset available — running the pipeline");
  await import("./index.js");
}

// A build must never fail for want of *fresh* data; the frontend surfaces a
// missing dataset on its own, and the seed fallback covers the rest.
main().catch((err) => {
  console.error("[ensure-data] fatal:", err);
  process.exitCode = 0;
});
