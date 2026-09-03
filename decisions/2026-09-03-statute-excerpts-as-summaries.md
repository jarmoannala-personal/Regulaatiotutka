# 2026-09-03 — Quote the statute instead of leaving the panel empty

## Decision: give every crawled Finnish act a verbatim excerpt of its own opening provision as its summary, tagged with where it came from (`summarySource`), and leave EU acts honestly empty

## Context

Earlier the same day, `hasSummary()` stopped the UI from printing a crawled
act's `summary` when that summary was only `shorten(title)` — the heading
twice. The reasoning holds, but the result is what the user actually sees:
almost every act now says *"Tiivistelmää ei ole"*, where before there was a
paragraph of (admittedly duplicated) text. Honest, and worse to use.

The dataset is 2500 events: 78 curated, 1483 FI, 1017 EU. So the question is
where real text can come from at build time without inventing any.

It turns out the Finnish half already has it. The Finlex search endpoint
returns **whole statute documents**, not metadata — the pipeline already reads
their bodies to parse commencement dates. A Finnish act's opening provision is
by drafting convention "1 § Lain tarkoitus" or "Soveltamisala", which is a
description of the act written by its own drafter.

## Alternatives considered

- **Revert `hasSummary()`.** Restores the paragraph by printing the title
  under itself. Rejected: it is the state the earlier commit deliberately
  removed, and it implies a description exists.
- **Generate summaries with an LLM.** The only option that also covers the EU
  half, and the only one that can be *wrong*. This app's whole verification
  discipline exists because a fabricated reference is worse than a missing one.
  Parked in `IDEAS.md`, not chosen now.
- **Extend the curated seed.** Best quality, no scale: 2400 hand-written
  summaries is not a maintenance path.
- **Structural sentence from fields we already have** ("Muuttaa lakia X, 44 a
  ja 47 §, voimaan 1.1.2026"). True by construction, but it only restates the
  rows the panel already prints.
- **EU: fetch each act's Finnish text from CELLAR** and quote Article 1 the
  same way. It works (`Accept: application/xhtml+xml`, `Accept-Language: fin`)
  but the documents are 0.6–1.7 MB each, so ~1000 of them is a gigabyte per
  build for a source that publishes no abstract.
- **EU: the "Summaries of EU legislation" (LEGIS_SUM) works** linked from
  CELLAR by `summary_legislation_eu_summarizes_resource_legal`, which do exist
  in Finnish. Coverage is ~17 % of our corpus (8 of 47 works sampled for 2018)
  and the text datastream 404s on the manifestation URIs, so it needs scraping
  eur-lex.europa.eu. Parked.

## Reasoning

A quote is not a summary, and the UI does not pretend otherwise: the excerpt is
set as a blockquote with the provision named under it ("Ote säädöstekstistä,
1 § Lain tarkoitus"), and the source link is one row below. It is text the
pipeline cannot get wrong, because it did not write it — the one property this
project cares about most.

It is also free: no extra requests, no extra crawl budget, no new failure mode
in the throttle-bound Finlex crawls. The only new cost is a second, order-
preserving parse of each result page. That parse is necessary rather than
cosmetic: the default `fast-xml-parser` config groups children by tag name,
which lifts inline `<ref>` citations out of the sentence they sit in
("passilain1 momentissa" for "passilain (671/2006) 1 momentissa"). Statute
prose is only quotable if its word order survives.

Provenance is now data, not inference. `summarySource` is `curated` for the
seed's prose and `excerpt` for a quote; an event with neither carries
`summary: ""`, so the frontend stops guessing by comparing prefixes (that
comparison stays as the fallback for a dataset published before this change,
since a build no longer re-crawls and the live dataset can be a month old).
`mergeSeed` strips the excerpt's provenance when curated prose displaces it,
so hand-written text can never be labelled as a quote of some § it isn't.

## Trade-offs accepted

- **The EU half still has no text** — 1017 events say "Tiivistelmää ei ole".
  Fixing that means either a heavy crawl or generated prose; neither is free,
  and neither is this change.
- **An excerpt of an amending act quotes the amended provision's new wording**,
  which reads out of context ("2) arpajaisverolain (552/1992) 2 §:n …"). It is
  what the statute says, and the label names the §.
- **The first section is not always the most descriptive one.** The pick
  prefers a purpose/scope heading within the first eight sections and skips
  commencement and repeal sections, but an act whose 1 § is an organisational
  detail gets that instead.
- **Some FI documents get nothing**: Bank of Finland notices, treaty acts and
  similar carry no `<section>` at all. They are `summary: ""` like the EU half,
  which is the correct answer for them.
