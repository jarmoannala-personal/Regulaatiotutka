import type { RegulationEvent } from "../shared/schema.js";
import { KEEP_FROM_YEAR, MAX_EVENTS } from "./config.js";

/**
 * Merge event lists, keyed by `id`. Earlier lists win over later ones, so call
 * as `dedupeEvents(liveEvents, seedEvents)` — live pipeline data overrides the
 * committed seed for the same id.
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
