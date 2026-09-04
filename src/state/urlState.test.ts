/**
 * Round-trip and validation tests for the URL fragment codec.
 * Run: `npm test` (node:test via tsx — no framework).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppState } from "./appState";
import { defaultState } from "./appState";
import {
  parseHash,
  pickShared,
  serializeHash,
  stateFromHash,
  type UrlContext,
} from "./urlState";

const coverage = { fromYear: 2000, toYear: 2026 };
const defaults = defaultState(coverage);
const ctx: UrlContext = {
  defaults,
  timeRange: [Date.UTC(2000, 0, 1), Date.UTC(2026, 11, 31)],
  isKnownId: (id) => id === "fi:1390/2025" || id === "eu:32016R0679",
};

function state(patch: Partial<AppState>): AppState {
  return { ...defaults, ...patch };
}

test("default state serializes to an empty fragment", () => {
  assert.equal(serializeHash(defaults, ctx), "");
});

test("list view filtered to Finnish law", () => {
  const s = state({
    view: "list",
    filters: { domains: [], jurisdictions: ["FI"], impact: [] },
  });
  assert.equal(serializeHash(s, ctx), "view=list&jur=FI");
  assert.deepEqual(stateFromHash("#view=list&jur=FI", ctx), pickShared(s));
});

test("selected law keeps its id readable", () => {
  const s = state({ view: "list", selectedEventId: "fi:1390/2025" });
  const h = serializeHash(s, ctx);
  assert.equal(h, "view=list&id=fi:1390/2025");
  assert.deepEqual(stateFromHash(h, ctx), pickShared(s));
});

test("every shared key round-trips", () => {
  const s = state({
    view: "trend",
    dimension: "impact",
    filters: {
      domains: ["tax_duties", "data_protection"],
      jurisdictions: ["EU"],
      impact: ["high", "medium"],
    },
    listSort: "inForce",
    listRange: { from: "2015-01", to: "2020-12" },
    query: "alv 25,5 %",
    selectedEventId: "eu:32016R0679",
    timelinePosition: Date.UTC(2018, 4, 25),
    // Device-local keys must not leak into the fragment.
    mode: "auto",
    speed: 4,
    playing: true,
  });
  const h = serializeHash(s, ctx);
  assert.equal(
    h,
    "view=trend&dim=impact&dom=tax_duties,data_protection&jur=EU" +
      "&imp=high,medium&sort=inForce&from=2015-01&to=2020-12" +
      "&q=alv%2025,5%20%25" +
      "&id=eu:32016R0679&t=2018-05-25",
  );
  assert.deepEqual(stateFromHash(h, ctx), pickShared(s));
});

test("a link is a snapshot: unnamed keys are defaults, not the device's", () => {
  const s = stateFromHash("view=list", ctx)!;
  assert.deepEqual(s.filters, { domains: [], jurisdictions: [], impact: [] });
  assert.equal(s.timelinePosition, defaults.timelinePosition);
  assert.equal(s.selectedEventId, null);
});

test("no recognised key means no link state", () => {
  assert.equal(parseHash("", ctx), null);
  assert.equal(parseHash("#", ctx), null);
  assert.equal(parseHash("#foo=bar", ctx), null);
  assert.equal(stateFromHash("#/some/router/path", ctx), null);
});

test("invalid values fall out, valid neighbours survive", () => {
  const p = parseHash(
    "view=spreadsheet&dim=impact&dom=tax_duties,bogus&jur=SE&imp=high&sort=x",
    ctx,
  )!;
  assert.equal(p.view, undefined);
  assert.equal(p.dimension, "impact");
  assert.deepEqual(p.filters, {
    domains: ["tax_duties"],
    jurisdictions: [],
    impact: ["high"],
  });
  assert.equal(p.listSort, undefined);
});

test("unknown event ids are dropped", () => {
  assert.equal(parseHash("id=fi:1/1999", ctx)!.selectedEventId, undefined);
  assert.equal(
    parseHash("id=fi:1390/2025", ctx)!.selectedEventId,
    "fi:1390/2025",
  );
});

test("timeline cursor accepts year, month or day and clamps to coverage", () => {
  assert.equal(parseHash("t=2015", ctx)!.timelinePosition, Date.UTC(2015, 0, 1));
  assert.equal(
    parseHash("t=2015-06", ctx)!.timelinePosition,
    Date.UTC(2015, 5, 1),
  );
  assert.equal(
    parseHash("t=2015-06-15", ctx)!.timelinePosition,
    Date.UTC(2015, 5, 15),
  );
  assert.equal(parseHash("t=1990-01-01", ctx)!.timelinePosition, ctx.timeRange[0]);
  assert.equal(parseHash("t=2099-01-01", ctx)!.timelinePosition, ctx.timeRange[1]);
  assert.equal(parseHash("t=2015-02-30", ctx)!.timelinePosition, undefined);
  assert.equal(parseHash("t=yesterday", ctx)!.timelinePosition, undefined);
});

test("a cursor inside the default day serializes to no key", () => {
  const s = state({ timelinePosition: defaults.timelinePosition + 3600_000 });
  assert.equal(serializeHash(s, ctx), "");
});

test("query survives characters URLSearchParams treats specially", () => {
  const s = state({ query: "a&b=c+d #e" });
  assert.equal(stateFromHash(serializeHash(s, ctx), ctx)!.query, "a&b=c+d #e");
});

test("list range: open ends are omitted, bare years mean whole years", () => {
  const s = state({ view: "list", listRange: { from: "2015-06", to: null } });
  assert.equal(serializeHash(s, ctx), "view=list&from=2015-06");
  assert.deepEqual(stateFromHash("view=list&from=2015-06", ctx), pickShared(s));

  assert.deepEqual(parseHash("from=2015&to=2020", ctx)!.listRange, {
    from: "2015-01",
    to: "2020-12",
  });
  // A full date is truncated to its month; an inverted pair is swapped.
  assert.deepEqual(parseHash("from=2020-03-15&to=2015-06", ctx)!.listRange, {
    from: "2015-06",
    to: "2020-03",
  });
  // Nonsense at one end falls out; the other end survives.
  assert.deepEqual(parseHash("from=2015-13&to=soon", ctx)!.listRange, {
    from: null,
    to: null,
  });
  assert.deepEqual(parseHash("from=x&to=2020", ctx)!.listRange, {
    from: null,
    to: "2020-12",
  });
});
