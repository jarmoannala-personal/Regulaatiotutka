import type {
  Domain,
  ImpactTier,
  Jurisdiction,
} from "../../shared/schema";
import { DOMAINS, IMPACT_TIERS, JURISDICTIONS } from "../../shared/schema";

/** Which dimension the radar's angular sectors encode. */
export type CategoryDimension = "domain" | "jurisdiction" | "impact";

export type PlaySpeed = 0.1 | 0.5 | 1 | 2 | 4;

export interface AppState {
  /** Angular-sector dimension. Persisted. */
  dimension: CategoryDimension;
  /** "manual" = scrub; "auto" = sweeping hand. Persisted. */
  mode: "auto" | "manual";
  /** Transient: whether the auto sweep is running right now. */
  playing: boolean;
  /** Sweep speed in years/second. Persisted. */
  speed: PlaySpeed;
  /** Current timeline cursor as epoch ms. Persisted (last position). */
  timelinePosition: number;
  /** Active filters (empty array in a facet = "show all"). Persisted. */
  filters: {
    domains: Domain[];
    jurisdictions: Jurisdiction[];
    impact: ImpactTier[];
  };
  /** Transient: free-text search, ANDed with filters + time cursor. */
  query: string;
  /** Transient: blip open in the detail panel. */
  selectedEventId: string | null;
}

/** Keys persisted to localStorage (the rest are transient). */
export const PERSISTED_KEYS = [
  "dimension",
  "mode",
  "speed",
  "timelinePosition",
  "filters",
] as const satisfies readonly (keyof AppState)[];

export function defaultState(coverage: {
  fromYear: number;
  toYear: number;
}): AppState {
  return {
    dimension: "domain",
    mode: "manual",
    playing: false,
    speed: 1,
    // Start at the beginning so the user can play forward and watch laws
    // appear over time.
    timelinePosition: Date.UTC(coverage.fromYear, 0, 1),
    filters: { domains: [], jurisdictions: [], impact: [] },
    query: "",
    selectedEventId: null,
  };
}

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState>): void;
  subscribe(fn: (state: AppState) => void): () => void;
}

/** Minimal synchronous pub/sub store. */
export function createStore(initial: AppState): Store {
  let state = initial;
  const subscribers = new Set<(s: AppState) => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of subscribers) fn(state);
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

/** Order + membership helpers used by colors/legend/geometry. */
export function categoriesFor(dim: CategoryDimension): readonly string[] {
  switch (dim) {
    case "domain":
      return DOMAINS;
    case "jurisdiction":
      return JURISDICTIONS;
    case "impact":
      return IMPACT_TIERS;
  }
}
