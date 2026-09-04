# 2026-09-05 — Ohje ja dokumentaatio: a full-screen doc inside the app, with its numbers read from the loaded dataset

## Decision: open a full-screen Finnish documentation view from the About dialog, whose coverage figures, per-year charts and source list are computed from the dataset in the browser, and which names the data's limitations explicitly

## Context

The service looks authoritative — a radar of 3200 statutes with official links —
but the aineisto has known holes: uneven year coverage from Finlex throttling, a
keyword-based domain gate that silently drops statutes it does not recognise,
amendments limited to acts of parliament, and a graph view whose relations exist
only for EU law because Finland publishes no comparable machine-readable
relation data. None of that was visible to a reader. The *Tietoja* card had room
for three sentences, not for that.

## Alternatives considered

- **Extend the Tietoja card.** It is a 540 px dialog; the content is a dozen
  screens long. Growing it would have made both jobs worse.
- **A separate static page (`/ohje.html`).** A second entry point to style, and
  it loses the thing that makes this useful: the documentation runs inside the
  app, so it can read the dataset that is actually loaded.
- **Write the coverage numbers into the prose.** They would be wrong within a
  month. Everything factual — totals, per-domain table, per-year bars, the
  thinnest years, the build's own `generatedAt` and `sourceVersion` — is
  computed at open time, so the page cannot drift from the data.
- **No screenshots.** Rejected: the four views are the thing being explained,
  and a reader arriving from the About dialog may not have tried all of them.
  They are captured from the live site into `public/docs/` (~135 kB each,
  lazy-loaded) and are the one part that can go stale.
- **Stacked FI/EU bars in one chart.** Two small multiples on a shared y-scale
  instead: one series each needs no legend, and the two stay comparable.

## Reasoning

The honest way to say "coverage is uneven" is to draw it: the per-year bars make
the gaps self-evident, and the caption says outright that bar height measures
the crawl, not the volume of law. The limitations section then names each
mechanism in the reader's terms — why a law they know is missing, why the graph
has no Finnish edges, why an in-force date can be absent — rather than a generic
disclaimer.

## Trade-offs accepted

- **The screenshots are a manual artefact.** They were captured from the live
  site and will drift as the UI changes; nothing in the build checks them.
- **The documentation is a second place that describes the pipeline.** It is
  written for the reader of the service, `CLAUDE.md` and `README.md` for whoever
  maintains it; the numbers that would rot are computed rather than written.
- **~540 kB of images** ship with the site, lazily loaded and only inside the
  documentation view.
