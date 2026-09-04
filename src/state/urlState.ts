/**
 * Shareable state in the URL fragment.
 *
 * The app is static, so the fragment is the only part of the URL it owns:
 * `#view=list&jur=FI&id=fi:1390/2025` works on GitHub Pages and idle.fi alike
 * with no server rewrite. The fragment mirrors the {@link SHARED_KEYS} subset
 * of the store — what a colleague needs to see the same page — and nothing
 * more: play mode and speed stay in localStorage, and the graph's zoom is not
 * state at all.
 *
 * A link is a **snapshot**: every shared key not named in the fragment is at
 * its default, not at whatever the recipient last had. Otherwise "list, only
 * Finnish law" would open on top of the recipient's own domain filter and
 * show something the sender never saw. Only default values are omitted, so
 * the default state serializes to no fragment at all.
 *
 * Both functions are pure; `main.ts` owns `location` and `history`.
 */
import type { Domain, ImpactTier, Jurisdiction } from "../../shared/schema";
import {
  isDomain,
  isImpactTier,
  isJurisdiction,
} from "../../shared/schema";
import type {
  AppState,
  CategoryDimension,
  ListSort,
  ViewMode,
} from "./appState";

/** Store keys the fragment carries. Everything else is device-local. */
export const SHARED_KEYS = [
  "view",
  "dimension",
  "filters",
  "listSort",
  "query",
  "selectedEventId",
  "timelinePosition",
] as const satisfies readonly (keyof AppState)[];

export type SharedState = Pick<AppState, (typeof SHARED_KEYS)[number]>;

export interface UrlContext {
  /** What an absent key means. */
  defaults: AppState;
  /** Inclusive epoch-ms bounds the timeline cursor is clamped to. */
  timeRange: [number, number];
  /**
   * Whether the dataset has this event id. An unknown id (stale link, or a
   * live act the cap dropped) is ignored rather than opening an empty panel.
   */
  isKnownId: (id: string) => boolean;
}

const VIEWS: readonly ViewMode[] = ["radar", "trend", "graph", "list"];
const DIMENSIONS: readonly CategoryDimension[] = [
  "domain",
  "jurisdiction",
  "impact",
];
const SORTS: readonly ListSort[] = ["announced", "inForce"];

/** Fragment keys. Short but readable — people will see and edit these. */
const KEY = {
  view: "view",
  dimension: "dim",
  domains: "dom",
  jurisdictions: "jur",
  impact: "imp",
  listSort: "sort",
  query: "q",
  selectedEventId: "id",
  timelinePosition: "t",
} as const;

/** The shared subset of `state`, for resetting or comparing. */
export function pickShared(state: AppState): SharedState {
  return {
    view: state.view,
    dimension: state.dimension,
    filters: {
      domains: [...state.filters.domains],
      jurisdictions: [...state.filters.jurisdictions],
      impact: [...state.filters.impact],
    },
    listSort: state.listSort,
    query: state.query,
    selectedEventId: state.selectedEventId,
    timelinePosition: state.timelinePosition,
  };
}

/** `2015-06-01` for an epoch-ms cursor — day precision is all a link needs. */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * `YYYY`, `YYYY-MM` or `YYYY-MM-DD` to epoch ms (UTC), or null if it is not a
 * date. Missing month/day default to the first, so `t=2015` is New Year 2015.
 */
function parseIsoDay(s: string): number | null {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : 1;
  const d = m[3] ? Number(m[3]) : 1;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  // Reject Feb 30 and friends: Date.UTC silently rolls them over.
  return new Date(ms).getUTCDate() === d ? ms : null;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Percent-encode a value for the fragment, keeping the characters our ids and
 * lists use (`:` `/` `,`) readable. `URLSearchParams` would turn
 * `fi:1390/2025` into `fi%3A1390%2F2025`, which nobody wants to paste.
 */
function enc(value: string): string {
  return encodeURIComponent(value)
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/")
    .replace(/%2C/gi, ",");
}

/**
 * The fragment (without `#`) for `state`, or `""` when every shared key is at
 * its default. Keys are emitted in a fixed order so equal states give equal
 * strings.
 */
export function serializeHash(state: AppState, ctx: UrlContext): string {
  const d = ctx.defaults;
  const parts: string[] = [];
  const put = (key: string, value: string) => parts.push(`${key}=${enc(value)}`);

  if (state.view !== d.view) put(KEY.view, state.view);
  if (state.dimension !== d.dimension) put(KEY.dimension, state.dimension);
  if (!sameList(state.filters.domains, d.filters.domains)) {
    put(KEY.domains, state.filters.domains.join(","));
  }
  if (!sameList(state.filters.jurisdictions, d.filters.jurisdictions)) {
    put(KEY.jurisdictions, state.filters.jurisdictions.join(","));
  }
  if (!sameList(state.filters.impact, d.filters.impact)) {
    put(KEY.impact, state.filters.impact.join(","));
  }
  if (state.listSort !== d.listSort) put(KEY.listSort, state.listSort);
  if (state.query.trim() !== d.query.trim()) put(KEY.query, state.query.trim());
  if (state.selectedEventId && state.selectedEventId !== d.selectedEventId) {
    put(KEY.selectedEventId, state.selectedEventId);
  }
  // Compare at day precision — that is what the link carries, so a cursor
  // that only differs from the default within a day would round-trip to
  // "no key" anyway.
  if (isoDay(state.timelinePosition) !== isoDay(d.timelinePosition)) {
    put(KEY.timelinePosition, isoDay(state.timelinePosition));
  }
  return parts.join("&");
}

/**
 * The shared keys a fragment names, each validated against the schema — a
 * misspelt or stale value falls out rather than crashing or filtering to
 * nothing. Returns null when the fragment names no recognised key, so the
 * caller can tell "no link state" from "link state that happens to be the
 * default". A leading `#` is tolerated.
 */
export function parseHash(
  hash: string,
  ctx: UrlContext,
): Partial<SharedState> | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return null;
  }

  const out: Partial<SharedState> = {};
  let recognised = false;
  const has = (key: string) => {
    const present = params.has(key);
    if (present) recognised = true;
    return present;
  };
  const list = (key: string): string[] =>
    (params.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  if (has(KEY.view)) {
    const v = params.get(KEY.view) as ViewMode;
    if (VIEWS.includes(v)) out.view = v;
  }
  if (has(KEY.dimension)) {
    const v = params.get(KEY.dimension) as CategoryDimension;
    if (DIMENSIONS.includes(v)) out.dimension = v;
  }
  const anyFilter =
    has(KEY.domains) || has(KEY.jurisdictions) || has(KEY.impact);
  if (anyFilter) {
    out.filters = {
      domains: list(KEY.domains).filter(isDomain) as Domain[],
      jurisdictions: list(KEY.jurisdictions).filter(
        isJurisdiction,
      ) as Jurisdiction[],
      impact: list(KEY.impact).filter(isImpactTier) as ImpactTier[],
    };
  }
  if (has(KEY.listSort)) {
    const v = params.get(KEY.listSort) as ListSort;
    if (SORTS.includes(v)) out.listSort = v;
  }
  if (has(KEY.query)) {
    out.query = (params.get(KEY.query) ?? "").trim();
  }
  if (has(KEY.selectedEventId)) {
    const id = (params.get(KEY.selectedEventId) ?? "").trim();
    if (id && ctx.isKnownId(id)) out.selectedEventId = id;
  }
  if (has(KEY.timelinePosition)) {
    const ms = parseIsoDay((params.get(KEY.timelinePosition) ?? "").trim());
    if (ms !== null) {
      out.timelinePosition = Math.max(
        ctx.timeRange[0],
        Math.min(ctx.timeRange[1], ms),
      );
    }
  }
  return recognised ? out : null;
}

/**
 * The full shared state a fragment describes: the snapshot semantics above —
 * defaults for every shared key, overridden by what the fragment names. Null
 * when the fragment carries nothing, so the caller can fall back to the
 * device's own persisted state.
 */
export function stateFromHash(
  hash: string,
  ctx: UrlContext,
): SharedState | null {
  const parsed = parseHash(hash, ctx);
  if (!parsed) return null;
  return { ...pickShared(ctx.defaults), ...parsed };
}
