# 2026-08-16 — Show all recent law: add the säädöskokoelma crawl, exempt the recent window from the cap

## Decision: crawl Finlex's säädöskokoelma for recent amending acts, raise `MAX_EVENTS` to 2500, and make the cap unable to touch anything from `KEEP_FROM_YEAR` onwards

## Context

Asked to "see all the latest laws", the dataset held 6 Finnish events for 2026
and 11 amendments in total — all of them hand-seeded. Two independent causes:

1. The pipeline only read Finlex's `statute-consolidated` set. Amendments are
   folded into the act they amend and never appear there as their own document,
   so **every** live amending act was invisible: no VAT rate change, no
   dismissal-grounds reform, no competition-law inspection powers.
2. The 1200-event cap bound, and its tier-then-recency ordering could still drop
   recent low-tier items — which is most Finnish amendments.

## Alternatives considered

- **Raise the cap only.** Would have added historical EU breadth, not the
  missing amendments — they were not in the candidate set at all.
- **Keep amendments seed-only.** Honest but unscalable: hand-curating every
  "Laki X:n muuttamisesta" is not a maintenance path, and the seed exists for
  landmarks, not completeness.
- **Crawl the säädöskokoelma for all years (2000→).** ~1500 statutes/year at 10
  duplicated results per page is ~300 pages/year; Finlex's throttle makes even
  three years aspirational. Recent years are where "what changed" matters.
- **Run both Finlex crawls in parallel** (the obvious speedup). Tried: they 429
  each other out and the amendment crawl returned *nothing*. Sequential and
  back-to-back also failed — the first crawl's throttling swallowed the second.
  Only sequential-with-cooldown works.

## Reasoning

The säädöskokoelma is the only machine-readable source for Finnish change
events, which is precisely what a "muutostutka" is for. Ordering the crawls
amendments-first spends the scarce rate-limit budget on the scarcest and
freshest data; the consolidated crawl degrades gracefully because the seed
guarantees the landmark acts it would otherwise lose.

Exempting `KEEP_FROM_YEAR` onwards from the cap makes the invariant explicit:
the cap trades away history, never recency. That is the same recency bias the
newest-first fetch order already encodes.

Result: FI 2026 events 6 → 157, FI 2025 20 → 128, amendments 11 → 161, with
entry-into-force dates parsed from each statute's closing formula (spot-checked
against three statutes' text).

## Trade-offs accepted

- **Dataset ~2 MB** (~190 kB gzipped) and **2500 blips**: the radar's outer
  rings are dense. Legibility now leans on the legend filters, search and
  impact facet rather than on the dataset being small. If it proves too busy,
  lower `MAX_EVENTS` — the recent window is exempt, so recent law survives.
- **Pipeline runtime ~9 min** (two sequenced Finlex crawls plus a 30 s
  cooldown), up from ~6. Fine for CI; annoying locally, where `npx vite`
  against the existing dataset is the answer.
- **The amendment crawl is best-effort**: throttling typically limits it to the
  current year per build. Coverage of 2024–2025 amendments therefore varies
  between builds — the seed is what makes any given landmark reliable.
- **Parsed metadata**: `dateInForce` and `amendedSections` for amendments come
  from text parsing, not source fields. Open-ended commencement ("asetuksella
  säädettävänä ajankohtana") correctly yields no date, but a novel phrasing
  would silently yield none either.
