import type { RegulationEvent } from "../shared/schema.js";
import { KEEP_FROM_YEAR, MAX_EVENTS } from "./config.js";

/**
 * Merge event lists, keyed by `id`. Earlier lists win over later ones, so call
 * as `dedupeEvents(liveEvents, ...)` — a consolidated statute beats the same
 * act seen in the säädöskokoelma crawl, whose metadata is thinner.
 */
export function dedupeEvents(
  ...lists: RegulationEvent[][]
): RegulationEvent[] {
  const byId = new Map<string, RegulationEvent>();
  for (const list of lists) {
    for (const ev of list) {
      if (!byId.has(ev.id)) byId.set(ev.id, ev);
    }
  }
  return [...byId.values()];
}

/**
 * Fold the curated seed into the live events, keyed by `id`.
 *
 * The seed is the source of truth, so a curated act keeps **every field it
 * states** — its hand-written summary, its deliberate impact tier, domain and
 * title — and the live record only fills in what the seed leaves empty
 * (typically `amendedSections` and `eli`). The previous merge let live data
 * win the whole record, which silently replaced 46 of the 78 hand-written
 * summaries with the statute's own title every time a crawl happened to
 * return the same act: the pipeline cannot write a summary, only a human can,
 * so live data must never overwrite one.
 *
 * Acts the seed does not mention are passed through untouched.
 */
export function mergeSeed(
  live: RegulationEvent[],
  seed: RegulationEvent[],
): RegulationEvent[] {
  const curated = new Map(seed.map((ev) => [ev.id, ev]));
  const out: RegulationEvent[] = [];
  const used = new Set<string>();

  for (const ev of live) {
    const seedEv = curated.get(ev.id);
    if (!seedEv) {
      out.push(ev);
      continue;
    }
    used.add(ev.id);
    // Start from live (so its extra fields survive), then let every value the
    // seed actually states win.
    const merged = { ...ev } as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(seedEv)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      merged[key] = value;
    }
    // The seed's summary displaces the crawl's excerpt, so the excerpt's
    // provenance must go with it — otherwise curated prose would be labelled
    // as a quote of whichever section the live record happened to carry.
    merged.summarySource = "curated";
    delete merged.summaryRef;
    out.push(merged as unknown as RegulationEvent);
  }

  for (const ev of seed) {
    if (!used.has(ev.id)) out.push({ ...ev, summarySource: "curated" });
  }
  return out;
}

/**
 * Bound the dataset to {@link MAX_EVENTS}: keep all `high`, then `medium`, then
 * the most-recent `low` until the cap. Within a tier, newer events win.
 *
 * Two exemptions, both about not losing what the app is for:
 * - `protectedIds` (the curated seed) — the baseline coverage promise, whose
 *   older medium-tier landmarks a growing live result set would push out first.
 * - anything announced in {@link KEEP_FROM_YEAR} or later — the recent window
 *   the radar exists to show. The cap may only cost historical breadth.
 */
export function capEvents(
  events: RegulationEvent[],
  protectedIds: ReadonlySet<string> = new Set(),
  keepFromYear: number = KEEP_FROM_YEAR,
): RegulationEvent[] {
  if (events.length <= MAX_EVENTS) return events;
  const exempt = (ev: RegulationEvent) =>
    protectedIds.has(ev.id) || Number(ev.dateAnnounced.slice(0, 4)) >= keepFromYear;
  const kept = events.filter(exempt);
  const rest = events.filter((ev) => !exempt(ev));

  const byRecency = [...rest].sort((a, b) =>
    b.dateAnnounced.localeCompare(a.dateAnnounced),
  );
  const order = { high: 0, medium: 1, low: 2 } as const;
  byRecency.sort((a, b) => order[a.impactTier] - order[b.impactTier]);

  const room = Math.max(0, MAX_EVENTS - kept.length);
  return [...kept, ...byRecency.slice(0, room)];
}

/** Drop events outside [fromYear, toYear] or with an unparseable date. */
export function withinCoverage(
  events: RegulationEvent[],
  fromYear: number,
  toYear: number,
): RegulationEvent[] {
  return events.filter((ev) => {
    const year = Number(ev.dateAnnounced.slice(0, 4));
    return Number.isFinite(year) && year >= fromYear && year <= toYear;
  });
}
