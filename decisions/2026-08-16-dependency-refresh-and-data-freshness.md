# 2026-08-16 — Dependency refresh and data-freshness pass

## Decision: take the major dev-dependency upgrades (Vite 8, TypeScript 7, fast-xml-parser 5) now, and make the data pipeline biased toward recent law

Two related calls made in one maintenance pass after ~3 months without a build:

1. **Dependencies**: apply `npm audit fix` (vite 6.4.3, postcss, nanoid, esbuild)
   *and* the majors — vite `^8.2.1`, typescript `^7.0.2`, fast-xml-parser
   `^5.11.0`, @types/node `^26` — rather than patch-only.
2. **Pipeline**: coverage `TO_YEAR` derives from the current year, Finlex years
   are fetched newest-first, seed ids are exempt from the `MAX_EVENTS` cap, and
   429 backoff grows to 5 attempts / 15 s (honouring `Retry-After`).

## Context

- 5 npm advisories (3 high), all in the dev/build chain; the app itself ships
  one runtime dependency (d3).
- The committed seed's newest entry was from November 2024 — no 2025 or 2026
  law in the guaranteed baseline, and one entry (VAT 25,5 %) carried a statute
  number pointing at an unrelated decree.
- The Finlex loop ran oldest-first under a 240 s wall-clock budget, so throttled
  runs silently dropped 2020–2026 — exactly the years the radar is for.
- `TO_YEAR` was hardcoded to 2026, so the app would quietly stop covering new
  law in 2027.

## Alternatives considered

- **Patch-only dependency updates.** Would have cleared the advisories, but
  left three majors to age further; the app has no framework and no plugins, so
  the upgrade surface is small and the risk is best taken while it is small.
- **Raise `MAX_EVENTS` instead of protecting seed ids.** Rejected: the cap
  exists to keep the radar legible and the JSON small; the real requirement is
  that the curated baseline never disappears.
- **Regenerate the seed from live data.** Rejected: the seed's value is
  hand-written Finnish summaries and deliberate impact tiers, which live titles
  cannot provide.

## Reasoning

Vite 8 and TypeScript 7 both build and typecheck the project unchanged, so the
majors cost nothing today and avoid a compounding upgrade later.
fast-xml-parser 5's advisory is in `XMLBuilder` (unused here), but the v5 parser
was verified against live Finlex XML before switching.

For the data: every seed entry — the 29 added and the 49 that predate this pass
— was cross-checked against Finlex `akn/fi/act/statute` and the CELLAR SPARQL
endpoint, which is how the wrong VAT statute number and four off-by-days dates
surfaced. Recency bias in the fetch order matches what the seed protection and
the cap already assume: recent law is the product.

## Trade-offs accepted

- TypeScript 7 is the native compiler port; if it disagrees with `tsc` 5 on some
  future edge case, the fix lands in this project rather than being deferred.
- Finlex fetches now spend up to 360 s and back off up to 15 s per 429, so a
  throttled CI build is slower (still bounded, still exits 0).
- Seed protection means a very large seed could crowd out live events. At 78 of
  1200 that is not a live concern, but it is now a real coupling.
- Seed summaries are hand-written from the statute text, so they need the same
  verification discipline on every future edit; `npm run validate:seed` checks
  structure, not accuracy.
