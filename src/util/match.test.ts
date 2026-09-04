/**
 * The list view's date-range predicate. Run: `npm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { RegulationEvent } from "../../shared/schema";
import { defaultState } from "../state/appState";
import { inListRange, isYearMonth, passesListFilters } from "./match";

const defaults = defaultState({ fromYear: 2000, toYear: 2026 });

function event(patch: Partial<RegulationEvent>): RegulationEvent {
  return {
    id: "fi:1/2018",
    jurisdiction: "FI",
    title: "Kilpailulaki",
    summary: "",
    domain: "competition",
    impactTier: "high",
    instrumentType: "act",
    dateAnnounced: "2018-06-01",
    dateInForce: "2019-01-01",
    sourceUrl: "https://finlex.fi/fi/lainsaadanto/2018/1",
    ...patch,
  } as RegulationEvent;
}

test("isYearMonth accepts only YYYY-MM with a real month", () => {
  assert.ok(isYearMonth("2015-01"));
  assert.ok(isYearMonth("2015-12"));
  assert.ok(!isYearMonth("2015-13"));
  assert.ok(!isYearMonth("2015-00"));
  assert.ok(!isYearMonth("2015"));
  assert.ok(!isYearMonth("2015-01-01"));
  assert.ok(!isYearMonth(2015));
  assert.ok(!isYearMonth(null));
});

test("an open range passes everything, unknown dates included", () => {
  const open = { from: null, to: null };
  assert.ok(inListRange("2018-06-01", open));
  assert.ok(inListRange(null, open));
});

test("the range is inclusive at both month ends", () => {
  const r = { from: "2015-01", to: "2020-12" };
  assert.ok(inListRange("2015-01-01", r));
  assert.ok(inListRange("2020-12-31", r));
  assert.ok(!inListRange("2014-12-31", r));
  assert.ok(!inListRange("2021-01-01", r));
  assert.ok(inListRange("2015-01-31", { from: "2015-01", to: "2015-01" }));
});

test("a half-open range bounds one side only", () => {
  assert.ok(inListRange("2099-01-01", { from: "2015-01", to: null }));
  assert.ok(!inListRange("2014-12-31", { from: "2015-01", to: null }));
  assert.ok(inListRange("1999-01-01", { from: null, to: "2020-12" }));
  assert.ok(!inListRange("2021-01-01", { from: null, to: "2020-12" }));
});

test("an unknown date fails any bounded range", () => {
  assert.ok(!inListRange(null, { from: "2015-01", to: null }));
  assert.ok(!inListRange(null, { from: null, to: "2020-12" }));
});

test("the range is ANDed with the search and follows the sort date", () => {
  const e = event({});
  const ranged = {
    ...defaults,
    query: "kilpailu",
    listRange: { from: "2015-01", to: "2020-12" },
  };
  // Announced 2018 → in range; the query matches too.
  assert.ok(passesListFilters(e, ranged));
  // Same range, but the query no longer matches.
  assert.ok(!passesListFilters(e, { ...ranged, query: "tietosuoja" }));
  // Same query, but announced outside the range.
  assert.ok(
    !passesListFilters(event({ dateAnnounced: "2012-01-01" }), ranged),
  );
  // Sorting by entry into force switches which date the range applies to.
  const late = event({ dateAnnounced: "2018-06-01", dateInForce: "2023-01-01" });
  assert.ok(passesListFilters(late, ranged));
  assert.ok(!passesListFilters(late, { ...ranged, listSort: "inForce" }));
});
