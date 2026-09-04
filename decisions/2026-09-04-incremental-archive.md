# 2026-09-04 — Coverage accumulates: the published dataset is an input, and the crawl backfills on rotation

## Decision: feed the last published dataset back into the pipeline as an archive, crawl only the recent window plus a rotating slice of history, re-derive keyword domains from archived titles, and widen the employment keyword map (with `MAX_EVENTS` 2500 → 6000)

## Context

Two questions about coverage — "is the seed real data?" and "are we missing
laws that affect Finnish companies and workforce?" — turned into a look at
what the dataset actually contains. Three findings, in order of how much they
cost:

- **`employment_labour` held 91 of 2500 events**, 2–9 a year. The keyword map
  knew `työsopimu` and `työaika` but not `työntekij`, `työnantaj`, `työeläke`,
  `työttömyystur`, `lomautu`, `irtisanomis`, `perhevapa` or `yhdenvertaisuus`,
  and `tax_duties` was tried first, so an employer levy went to tax. A statute
  no rule matches is dropped outright in `normalizeFinlex`, so this is the
  gate that decides whether a law appears at all.
- **Every run rebuilt the dataset from one crawl**, so a year the Finlex
  throttle did not reach that day was simply gone: FI 2000–2007 sat at 0–1
  events a year, 2014 at 3, 2020 at 0. The next run started over, so nothing
  ever accumulated — coverage was a per-run lottery.
- **`MAX_EVENTS = 2500` was binding on every build.** It only ever costs
  pre-`KEEP_FROM_YEAR` breadth (the seed and the recent window are exempt),
  but 2500 events are 1.9 MB raw and ~235 kB gzipped, so the ceiling is
  rendering, not bandwidth.

## Alternatives considered

- **Split the published file into era bundles (2000s, 2010s, yearly).** The
  original suggestion. At 235 kB over the wire, with all three views
  aggregating over the whole 2000→now span and `loadDataset` fetching with
  `cache: "no-cache"`, the browser would fetch every bundle on first paint
  anyway; the only gain is HTTP caching the app currently opts out of. Worth
  revisiting as *lazy* loading — paint recent, backfill history — if the
  dataset really grows toward 6000.
- **Commit per-year crawl output to the repo.** Durable across cold checkouts,
  but it means CI writing back to `main`, and it contradicts "the generated
  dataset is never a record of anything". The mirrors already serve the last
  published dataset, and `ensureData` already trusts them.
- **Backfill by "fewest events first".** Self-correcting in principle, but a
  year that genuinely has few company-relevant acts would be re-crawled
  forever. A rotation is fair, deterministic and needs no state.
- **Let the archive win over live records.** Rejected: the live record is the
  current statute under the current rules. The archive only contributes what
  this run did not reach.
- **Raise `MAX_EVENTS` and change nothing else.** Would have added nothing —
  the cap only drops old low-tier events, and the crawl was not producing the
  old years in the first place.

## Reasoning

The archive turns coverage from a lottery into a ratchet. A year crawled once
stays, which is what makes the rotating backfill safe: `crawlYears` puts the
recent window (`KEEP_FROM_YEAR`→now) first, then `FINLEX_BACKFILL_YEARS` older
years chosen by a slice that advances monthly, so the monthly schedule sweeps
2000→2023 in six runs and a throttled run costs one backfill year rather than
this year's law. The budget stops being spent on years already covered.

Because the archive stores titles and `domainMap` is pure, an archived
`keyword` record can be re-tagged offline: `refreshKeywordDomains` re-derives
the domain on load, so today's widened employment map reaches yesterday's
records instead of being frozen out of them. Replayed over the current
dataset, 115 of 1483 FI events move into `employment_labour` — mostly TyEL and
työttömyysvakuutusmaksu instruments that had been shelved as financial.

`EuroVoc`-tagged records are left alone: their domain came from the work's own
concepts, which a title cannot second-guess.

## Trade-offs accepted

- **The archive cannot resurrect what the domain map dropped.** A statute
  rejected at crawl time never enters the dataset, so a later keyword widening
  reaches archived *records* but not archived *rejections* — those need the
  year re-crawled, which the rotation gets to within a few months.
- **`REBUILD=1` is the only escape hatch.** Anything that gets into the
  archive stays until it is re-crawled, re-tagged or dropped by the rules, so
  a bad record can persist for a rotation.
- **A total source outage no longer shows the offline banner** when an archive
  exists: `origin` stays `pipeline` because the data really is the published
  dataset. The run says so in `sourceVersion` (`archive-YYYY-MM-DD` with no
  `finlex-*`/`eurlex-*` alongside it) instead.
- **6000 events is untested in the browser.** 2500 renders fine; the radar and
  graph have not been measured above that, and the cap is the place to walk it
  back if they suffer.
- **An employer levy is now workforce law, not tax.** "Työnantajan
  sairausvakuutusmaksu" is defensibly either; the radar is company-facing, so
  it goes where HR would look for it.
