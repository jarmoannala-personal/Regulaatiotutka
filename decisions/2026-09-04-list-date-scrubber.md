# 2026-09-04 — List view: a two-thumb date scrubber beside the sort control

## Decision: add a month-range scrubber to the list toolbar that filters on whichever date the sort uses, ANDed with the facet filters and the search, resting at "everything"

## Context

The list view deliberately ignores the timeline cursor and hides the timeline
bar, so it had no way to answer "what came in 2015–2020?" — the only time
control was scrolling. The request was a scrubber next to *Annettu / Voimaan*
with no filtering applied by default, that keeps applying when a free-text
search is active, and that exists only in the list view.

## Alternatives considered

- **Reuse the timeline cursor as a range.** The cursor is a single point with
  play semantics, shared by the radar, trend and graph; giving it a second
  thumb would change every view. The list's "when" is its own.
- **Day-precision range like the cursor (`t=2015-06-15`).** A thumb cannot
  place a day on a 28-year track, and a link does not need it. Whole months,
  stored as `YYYY-MM` strings, compare lexicographically against the events'
  ISO dates with no Date arithmetic or time-zone edge.
- **Two native `<input type=range>` overlaid.** Cross-browser styling of a
  dual-thumb native range is worse than the ~200 lines of D3 the timeline
  already uses; the SVG twin also inherits its look.
- **Year-only dropdowns (from/to).** Precise but not a scrubber; the request
  was explicitly for one.
- **Keep undated acts visible under a range.** ~7 % of Finnish amendments
  have no in-force date. A range of "voimaan 2026–2027" cannot vouch for them,
  so they fail any bounded range and reappear when the range is cleared. The
  empty-state text names the range as something to widen.
- **Filter on both dates at once.** Confusing: the visible date column is the
  sort date, so the range follows it. Switching the sort re-applies the same
  months to the other date, which is what the readout says.

## Reasoning

`listRange: { from, to }` with `null` = unbounded means the default state is
`{ null, null }`, filters nothing, persists as such and serializes to no
fragment key — "by default no filtering" falls out of the representation. The
predicate (`inListRange`, `passesListFilters` in `src/util/match.ts`) is one
more conjunct after facets and query, so a search for "kilpailu" with
2015–2020 set shows competition law from those years only. Both are pure and
covered by `npm test`; so is the `from=`/`to=` codec (bare year = whole year,
full date truncated to month, inverted pair swapped, garbage dropped).

The track spans the data's years (1999–2027 today), not the coverage years,
because in-force dates run ahead of announcement dates. A thumb at either
extreme emits `null`, so dragging back to the end restores "Kaikki" without a
separate reset — the × button is a shortcut. The readout has a fixed width and
the button a reserved slot so the track does not shift under a thumb being
dragged away from an end (observed during verification), and the scrubber is
`user-select: none` so a missed drag does not select the tick labels.

Verified in Chrome against the 2500-event dataset: both thumbs drag and snap
to months; "kilpailu" + 1/2015–12/2020 gives 8 rows (2016–2019), switching to
*Voimaan* keeps the range and re-applies it to the in-force date; clear
returns to 26 rows; the fragment reads `from=2015-01&to=2020-12` and a link
with `from=2015&to=2020` opens with the range set.

## Trade-offs accepted

- Month granularity: a range cannot start mid-month. Acceptable for browsing.
- Undated acts vanish under any range rather than showing in a flagged group.
- The range is list-only state; the radar, trend and graph still have only the
  cursor. If a range ever makes sense there, `listRange` should be renamed.
