/**
 * Reading the **last published dataset** — the copy the deployed sites serve.
 *
 * Two callers need it and must agree on what counts as a dataset:
 * `ensureData` uses it to skip the crawl on a code-only build, and the
 * pipeline uses it as its archive input, so a year crawled once does not have
 * to be crawled again (see `archive.ts`).
 */
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RegulationDataset } from "../shared/schema.js";
import { SCHEMA_VERSION } from "../shared/schema.js";
import { OUTPUT_PATH, USER_AGENT } from "./config.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const outPath = resolve(repoRoot, OUTPUT_PATH);

/**
 * Mirrors that serve the last published dataset, tried in order. Both are
 * public and serve the same file; `DATA_URL` overrides for a private host.
 */
export const MIRRORS = [
  "https://jarmoannala-personal.github.io/Regulaatiotutka/data/regulations.v1.json",
  "https://auski.idle.fi/Regulaatiotutka/data/regulations.v1.json",
];

const FETCH_TIMEOUT_MS = 20_000;

/** Enough of a check that a mirror served a dataset and not an error page. */
export function looksLikeDataset(v: unknown): v is RegulationDataset {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    d.schemaVersion === SCHEMA_VERSION &&
    Array.isArray(d.events) &&
    d.events.length > 0
  );
}

export function describe(dataset: RegulationDataset): string {
  return (
    `${dataset.counts?.total ?? dataset.events.length} events, ` +
    `origin=${dataset.origin}, generated ${dataset.generatedAt}`
  );
}

/** The dataset a previous run left on disk, raw, or null if there is none. */
export async function readLocalDataset(): Promise<string | null> {
  try {
    if ((await stat(outPath)).size === 0) return null;
    const raw = await readFile(outPath, "utf8");
    return looksLikeDataset(JSON.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

export async function fetchMirrorDataset(
  url: string,
  label = "data",
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[${label}] ${url}: HTTP ${res.status}`);
      return null;
    }
    const raw = await res.text();
    if (!looksLikeDataset(JSON.parse(raw) as unknown)) {
      console.warn(`[${label}] ${url}: not a ${SCHEMA_VERSION} dataset`);
      return null;
    }
    return raw;
  } catch (err) {
    console.warn(
      `[${label}] ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export interface PublishedDataset {
  raw: string;
  dataset: RegulationDataset;
  /** "local" for the file on disk, otherwise the mirror URL it came from. */
  source: string;
}

/** The local dataset if there is one, else the first mirror that serves one. */
export async function loadPublishedDataset(
  label = "data",
): Promise<PublishedDataset | null> {
  const local = await readLocalDataset();
  if (local) {
    return { raw: local, dataset: JSON.parse(local), source: "local" };
  }
  const urls = process.env.DATA_URL ? [process.env.DATA_URL] : MIRRORS;
  for (const url of urls) {
    const raw = await fetchMirrorDataset(url, label);
    if (raw) return { raw, dataset: JSON.parse(raw), source: url };
  }
  return null;
}
