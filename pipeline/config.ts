/** Build-time pipeline configuration. */

export const FROM_YEAR = 2000;

/** Coverage always runs to the current year, so the radar never silently
 *  stops at a hardcoded past year when the build runs in a later year. */
export const TO_YEAR = new Date().getUTCFullYear();

/**
 * Hard cap on dataset size to keep the radar legible and the JSON small.
 * When exceeded, all `high` are kept, then `medium`, then the most-recent
 * `low` until the cap (see `dedupe.ts` -> `capEvents`).
 *
 * The curated seed and everything from {@link KEEP_FROM_YEAR} onwards are
 * exempt — the cap may only cost historical breadth, never recent law.
 */
export const MAX_EVENTS = 2500;

/**
 * Recent-window floor: events announced in this year or later always survive
 * the cap. Matches the amendment crawl window, so "the latest laws" means the
 * same span everywhere in the pipeline.
 */
export const KEEP_FROM_YEAR = new Date().getUTCFullYear() - 2;

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
/** 429 retry policy: exponential backoff, capped, honouring Retry-After. */
export const FINLEX_MAX_RETRIES = 5;
export const FINLEX_MAX_BACKOFF_MS = 15_000;
/** Overall wall-clock budget for Finlex so the build stays bounded. Years are
 *  fetched newest-first, so an exhausted budget costs breadth in the 2000s,
 *  not this year's statutes. */
export const FINLEX_BUDGET_MS = 300_000;

/** Säädöskokoelma crawl (amending acts). ~1500 statutes/year, and the endpoint
 *  returns each twice at 10 per page, so a full year is ~300 pages — hence the
 *  short year window and its own budget. */
export const FINLEX_AMENDMENT_YEARS = 3;
/** Pause between the two Finlex crawls to let the service's throttle recover;
 *  without it the first crawl's rate limiting swallows the second one. */
export const FINLEX_COOLDOWN_MS = 30_000;
export const FINLEX_AMENDMENT_MAX_PAGES_PER_YEAR = 340;
export const FINLEX_AMENDMENT_BUDGET_MS = 420_000;
