import type { RegulationEvent } from "../../shared/schema";
import type { AppState } from "../state/appState";

/** True if the event is excluded by the active legend facet filters. */
export function isFiltered(
  e: RegulationEvent,
  f: AppState["filters"],
): boolean {
  if (f.domains.length && !f.domains.includes(e.domain)) return true;
  if (f.jurisdictions.length && !f.jurisdictions.includes(e.jurisdiction)) {
    return true;
  }
  if (f.impact.length && !f.impact.includes(e.impactTier)) return true;
  return false;
}

/**
 * Free-text match: case-insensitive, every whitespace-separated token must
 * appear somewhere in title + summary + statute number + CELEX. Empty query
 * matches everything.
 */
export function matchesQuery(e: RegulationEvent, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = `${e.title} ${e.summary} ${e.statuteNumber ?? ""} ${
    e.celex ?? ""
  }`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

/**
 * The combined visibility predicate ANDing legend filters and search.
 * (The timeline cursor gate is applied separately by the radar/feed.)
 */
export function passesFiltersAndQuery(
  e: RegulationEvent,
  state: AppState,
): boolean {
  return !isFiltered(e, state.filters) && matchesQuery(e, state.query);
}
