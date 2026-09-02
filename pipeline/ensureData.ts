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
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION } from "../shared/schema.js";
import { OUTPUT_PATH, USER_AGENT } from "./config.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(repoRoot, OUTPUT_PATH);

/**
 * Mirrors that serve the last published dataset, tried in order. Both are
 * public and serve the same file; `DATA_URL` overrides for a private host.
 */
const MIRRORS = [
  "https://jarmoannala-personal.github.io/Regulaatiotutka/data/regulations.v1.json",
  "https://auski.idle.fi/Regulaatiotutka/data/regulations.v1.json",
];

const FETCH_TIMEOUT_MS = 20_000;

/** Enough of a check that a mirror served a dataset and not an error page. */
function looksLikeDataset(v: unknown): v is { events: unknown[] } {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    d.schemaVersion === SCHEMA_VERSION &&
    Array.isArray(d.events) &&
    d.events.length > 0
  );
}

function describe(dataset: Record<string, unknown>): string {
  const counts = dataset.counts as { total?: number } | undefined;
  return (
    `${counts?.total ?? "?"} events, origin=${String(dataset.origin)}, ` +
    `generated ${String(dataset.generatedAt)}`
  );
}

async function existingLocal(): Promise<string | null> {
  try {
    if ((await stat(outPath)).size === 0) return null;
    const raw = await readFile(outPath, "utf8");
    return looksLikeDataset(JSON.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

async function fromMirror(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[ensure-data] ${url}: HTTP ${res.status}`);
      return null;
    }
    const raw = await res.text();
    const parsed: unknown = JSON.parse(raw);
    if (!looksLikeDataset(parsed)) {
      console.warn(`[ensure-data] ${url}: not a v1 dataset`);
      return null;
    }
    console.log(
      `[ensure-data] using ${url} — ` +
        describe(parsed as Record<string, unknown>),
    );
    return raw;
  } catch (err) {
    console.warn(
      `[ensure-data] ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** Atomic write, matching `writeDataset`. */
async function write(raw: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  await writeFile(tmpPath, raw, "utf8");
  await rename(tmpPath, outPath);
}

async function main(): Promise<void> {
  const local = await existingLocal();
  if (local) {
    console.log(
      `[ensure-data] using existing ${OUTPUT_PATH} — ` +
        describe(JSON.parse(local) as Record<string, unknown>),
    );
    return;
  }

  const urls = process.env.DATA_URL ? [process.env.DATA_URL] : MIRRORS;
  for (const url of urls) {
    const raw = await fromMirror(url);
    if (raw) {
      await write(raw);
      return;
    }
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
