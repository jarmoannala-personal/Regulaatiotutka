import type { RegulationDataset, RegulationEvent } from "../../shared/schema";
import {
  isDomain,
  isImpactTier,
  isJurisdiction,
  SCHEMA_VERSION,
} from "../../shared/schema";

/**
 * The future "data as a service" swap is here: point this at the remote
 * endpoint instead of the build-time static file. The {@link RegulationDataset}
 * shape is the contract that must not change.
 */
const DATASET_URL = `${import.meta.env.BASE_URL}data/regulations.v1.json`;

function isEvent(v: unknown): v is RegulationEvent {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.title === "string" &&
    isJurisdiction(e.jurisdiction) &&
    isDomain(e.domain) &&
    isImpactTier(e.impactTier) &&
    typeof e.dateAnnounced === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.dateAnnounced) &&
    typeof e.sourceUrl === "string" &&
    typeof e.summary === "string"
  );
}

/** Fetch and structurally validate the dataset; throws on a corrupt payload. */
export async function loadDataset(): Promise<RegulationDataset> {
  const res = await fetch(DATASET_URL, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Dataset fetch failed: HTTP ${res.status}`);
  }
  const data: unknown = await res.json();
  if (typeof data !== "object" || data === null) {
    throw new Error("Dataset is not an object");
  }
  const d = data as Record<string, unknown>;
  if (d.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schemaVersion: ${String(d.schemaVersion)} ` +
        `(expected ${SCHEMA_VERSION})`,
    );
  }
  if (!Array.isArray(d.events) || !d.events.every(isEvent)) {
    throw new Error("Dataset events are missing or malformed");
  }
  return data as RegulationDataset;
}
