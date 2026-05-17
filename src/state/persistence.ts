import {
  isDomain,
  isImpactTier,
  isJurisdiction,
} from "../../shared/schema";
import type { AppState, CategoryDimension, PlaySpeed } from "./appState";
import { PERSISTED_KEYS } from "./appState";

// v2: redesign changed defaults (cursor starts at 2000) and semantics.
const STORAGE_KEY = "regulaatiotutka.state.v2";

const DIMENSIONS: CategoryDimension[] = ["domain", "jurisdiction", "impact"];
const SPEEDS: PlaySpeed[] = [0.5, 1, 2, 4];

/**
 * Deep-merge persisted state over `defaults`, validating every field so a
 * stale/corrupt payload can never crash the app — unknown values fall back to
 * the default. Bumping {@link STORAGE_KEY} cleanly invalidates old state.
 */
export function loadPersisted(defaults: AppState): AppState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return defaults;
  }
  if (!raw) return defaults;

  let parsed: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return defaults;
    parsed = v as Record<string, unknown>;
  } catch {
    return defaults;
  }

  const next: AppState = { ...defaults };

  if (DIMENSIONS.includes(parsed.dimension as CategoryDimension)) {
    next.dimension = parsed.dimension as CategoryDimension;
  }
  if (parsed.mode === "auto" || parsed.mode === "manual") {
    next.mode = parsed.mode;
  }
  if (SPEEDS.includes(parsed.speed as PlaySpeed)) {
    next.speed = parsed.speed as PlaySpeed;
  }
  if (typeof parsed.timelinePosition === "number") {
    next.timelinePosition = parsed.timelinePosition;
  }
  if (typeof parsed.filters === "object" && parsed.filters !== null) {
    const f = parsed.filters as Record<string, unknown>;
    next.filters = {
      domains: Array.isArray(f.domains) ? f.domains.filter(isDomain) : [],
      jurisdictions: Array.isArray(f.jurisdictions)
        ? f.jurisdictions.filter(isJurisdiction)
        : [],
      impact: Array.isArray(f.impact) ? f.impact.filter(isImpactTier) : [],
    };
  }
  return next;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Debounced persist of the {@link PERSISTED_KEYS} subset only. */
export function savePersisted(state: AppState): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const subset: Partial<AppState> = {};
    for (const key of PERSISTED_KEYS) {
      (subset as Record<string, unknown>)[key] = state[key];
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(subset));
    } catch {
      /* quota / disabled storage — non-fatal */
    }
  }, 300);
}
