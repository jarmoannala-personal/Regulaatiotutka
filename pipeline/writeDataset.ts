import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  RegulationDataset,
  RegulationEdge,
  RegulationEvent,
} from "../shared/schema.js";
import { SCHEMA_VERSION } from "../shared/schema.js";
import { FROM_YEAR, OUTPUT_PATH, TO_YEAR } from "./config.js";

export function buildDataset(
  events: RegulationEvent[],
  origin: RegulationDataset["origin"],
  sourceVersion: string,
  edges: RegulationEdge[],
): RegulationDataset {
  const sorted = [...events].sort((a, b) =>
    a.dateAnnounced.localeCompare(b.dateAnnounced),
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceVersion,
    origin,
    coverage: { fromYear: FROM_YEAR, toYear: TO_YEAR },
    counts: {
      total: sorted.length,
      fi: sorted.filter((e) => e.jurisdiction === "FI").length,
      eu: sorted.filter((e) => e.jurisdiction === "EU").length,
    },
    events: sorted,
    edges,
  };
}

/** Atomic write: stage to a temp file in the same dir, then rename over. */
export async function writeDataset(
  dataset: RegulationDataset,
  repoRoot: string,
): Promise<string> {
  const outPath = resolve(repoRoot, OUTPUT_PATH);
  await mkdir(dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(dataset, null, 2) + "\n", "utf8");
  await rename(tmpPath, outPath);
  return outPath;
}
