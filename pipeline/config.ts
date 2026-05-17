/** Build-time pipeline configuration. */

export const FROM_YEAR = 2000;
export const TO_YEAR = 2026;

/**
 * Hard cap on dataset size to keep the radar legible and the JSON small.
 * When exceeded, all `high` are kept, then `medium`, then the most-recent
 * `low` until the cap (see `dedupe.ts` -> `capEvents`).
 */
export const MAX_EVENTS = 1200;

/** Output path, relative to repo root. The frontend fetches this verbatim. */
export const OUTPUT_PATH = "public/data/regulations.v1.json";

/** Committed offline fallback, relative to repo root. */
export const SEED_PATH = "pipeline/seed/seed-events.json";

export const FINLEX_BASE = "https://opendata.finlex.fi/finlex/avoindata/v1";

/** Identify the pipeline politely to the Finlex open-data service. */
export const USER_AGENT =
  "RegulaatiotutkaPipeline/1.0 (contact: jarmo.annala@idle.fi)";

/** CELLAR SPARQL endpoint (EU Publications Office). */
export const EURLEX_SPARQL = "https://publications.europa.eu/webapi/rdf/sparql";

/** Per-source network budget so a slow source can't stall the whole build. */
export const SOURCE_TIMEOUT_MS = 60_000;

/** Finlex paging bounds. Live Finlex is bonus breadth on top of the seed, so
 *  we cap per-year paging to keep the build bounded (the search endpoint
 *  returns full document bodies). */
/** Search endpoint hard-caps page size at 10 (per its OpenAPI schema). */
export const FINLEX_PAGE_LIMIT = 10;
export const FINLEX_MAX_PAGES_PER_YEAR = 40;
export const FINLEX_SPACING_MS = 120;
/** Overall wall-clock budget for Finlex so the build stays bounded. */
export const FINLEX_BUDGET_MS = 240_000;
