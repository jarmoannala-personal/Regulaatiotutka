/**
 * Validates the committed seed against the shared data contract.
 *
 * The seed is hand-curated and is the offline fallback for the whole app, so a
 * typo here ships silently. Run via `npm run validate:seed` (and in CI before
 * the build).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  isDomain,
  isImpactTier,
  isJurisdiction,
  type RegulationEvent,
} from "../shared/schema.js";
import { FROM_YEAR, SEED_PATH, TO_YEAR } from "./config.js";

const INSTRUMENT_TYPES = ["act", "amendment", "regulation", "directive"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SUMMARY_MAX = 280;

function validate(events: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(events)) return ["seed is not an array"];

  const seen = new Set<string>();
  events.forEach((raw, i) => {
    const e = raw as Partial<RegulationEvent>;
    const at = `#${i} ${e.id ?? "(no id)"}`;
    const bad = (msg: string) => errors.push(`${at}: ${msg}`);

    if (!e.id) bad("missing id");
    else if (seen.has(e.id)) bad("duplicate id");
    else seen.add(e.id);

    if (!e.title?.trim()) bad("missing title");
    if (!isJurisdiction(e.jurisdiction)) bad(`bad jurisdiction ${e.jurisdiction}`);
    if (!isDomain(e.domain)) bad(`bad domain ${e.domain}`);
    if (!isImpactTier(e.impactTier)) bad(`bad impactTier ${e.impactTier}`);
    if (!INSTRUMENT_TYPES.includes(e.instrumentType as string)) {
      bad(`bad instrumentType ${e.instrumentType}`);
    }

    if (!ISO_DATE.test(e.dateAnnounced ?? "")) bad(`bad dateAnnounced ${e.dateAnnounced}`);
    else {
      const year = Number(e.dateAnnounced!.slice(0, 4));
      if (year < FROM_YEAR || year > TO_YEAR) bad(`dateAnnounced ${year} outside coverage`);
    }
    if (e.dateInForce != null && !ISO_DATE.test(e.dateInForce)) {
      bad(`bad dateInForce ${e.dateInForce}`);
    }

    if (!e.summary?.trim()) bad("missing summary");
    else if (e.summary.length > SUMMARY_MAX) {
      bad(`summary ${e.summary.length} chars > ${SUMMARY_MAX}`);
    }
    if (!e.sourceUrl?.startsWith("https://")) bad(`bad sourceUrl ${e.sourceUrl}`);

    // Id must agree with the jurisdiction-specific key, so live data can
    // dedupe against the seed by id.
    if (e.jurisdiction === "FI") {
      if (!e.statuteNumber) bad("FI event without statuteNumber");
      else if (e.id !== `fi:${e.statuteNumber}`) bad("id does not match statuteNumber");
    } else if (e.jurisdiction === "EU") {
      if (!e.celex) bad("EU event without celex");
      else if (e.id !== `eu:${e.celex}`) bad("id does not match celex");
    }
  });
  return errors;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seed = JSON.parse(await readFile(resolve(repoRoot, SEED_PATH), "utf8"));
const errors = validate(seed);

if (errors.length > 0) {
  console.error(`[validate-seed] ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`[validate-seed] ok: ${(seed as unknown[]).length} events`);
