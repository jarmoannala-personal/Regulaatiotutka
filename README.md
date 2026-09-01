# Regulaatiotutka — Regulation Radar

A mostly-frontend web app that makes Finnish and EU **legislative change legible
over time**, focused on what matters to companies (oy, oyj, tmi, säätiö,
yhdistys): corporate governance, tax, accounting, employment, data protection,
financial/securities, competition and environment.

A timeline scrubber (2000→2026, with 0.1×–4× auto-play) is the primary
control across three switchable **views**, all sharing the same dimension
switch (legal domain / Finland vs EU / impact), legend filters and search:

- **Tutka (radar)** — sweep radar: radial distance encodes time (outer =
  newer), angular sectors the chosen dimension. Blips pop in and sectors
  "flash" as changes enter the window during play/scrub.
- **Trendi (trend)** — per-category yearly volume lines that grow with the
  cursor; shows when each area surged (e.g. data protection 2016–2018).
- **Graafi (graph)** — *experimental* d3 force network of real EUR-Lex
  legal relationships (amends / repeals / based-on, ~1000 edges) with
  wheel/trackpad-pinch zoom and drag-pan; self-degrades to an empty note
  when filtered too sparse.

Hover any item for a summary, click for the official source. A right-hand
dock holds a free-text search, the legend (click to filter), and a
timeline-following feed of the legislation as it appears. The search has a
hand-curated EN/acronym↔Finnish + CELEX alias map, so "gdpr", "ai act" or
"tax" hit the Finnish corpus.

## Architecture

- **No runtime backend.** A build-time pipeline (`pipeline/`) fetches and
  normalizes open data into a single static `public/data/regulations.v1.json`
  the frontend loads. Settings persist in `localStorage`.
- `shared/schema.ts` is the single data contract, imported by both the pipeline
  and the app, so the JSON shape can't drift. Swapping to a future
  "data as a service" is a one-line URL change in `src/data/loadDataset.ts`.
- Frontend: Vite + TypeScript + D3 (no UI framework), static-hostable.

## Data sources

| Source | Use | Licence |
| --- | --- | --- |
| [EUR-Lex / CELLAR SPARQL](https://publications.europa.eu/webapi/rdf/sparql) | EU regulations & directives (EuroVoc-tagged) + amends/repeals/based-on edges | metadata CC0, content CC BY 4.0 |
| [Finlex open data](https://opendata.finlex.fi) — `statute-consolidated` | Finnish consolidated statutes, i.e. acts in force (Akoma Ntoso XML) | open data, attribute Finlex |
| [Finlex open data](https://opendata.finlex.fi) — `statute` (säädöskokoelma) | Recent amending acts ("Laki X:n muuttamisesta"), which the consolidated set cannot show | open data, attribute Finlex |
| Committed seed (`pipeline/seed/seed-events.json`) | 78 curated landmark FI/EU acts (2001–2026); offline fallback | hand-curated |

The pipeline emits `events` plus an experimental `edges` array (EU legal
relationships among the kept events) into `regulations.v1.json`; the
`eurlex-edges` step is year-by-year, time-budgeted and failure-tolerant
(empty edges just make the graph view self-degrade).

Two things about the Finnish side are worth knowing. Amendments never appear in
the consolidated set — they are folded into the act they amend — so the
säädöskokoelma crawl is what puts "what changed lately" on the radar; it is
limited to the last few years because a year is ~1500 statutes and the endpoint
returns 10 (duplicated) per page. And the two Finlex crawls run **in sequence
with a cooldown**, amendments first: run in parallel they 429 each other out,
and run back to back the first one's throttling swallows the second.

The pipeline merges the seed in every run for baseline coverage and **always
exits 0**: if both live sources are unreachable it writes the seed with
`origin: "seed-fallback"` and the UI shows an offline banner. Finlex is
rate-limited (HTTP 429) and capped by a wall-clock budget, so live FI breadth
varies run to run — the seed guarantees the important laws are always present
(Finlex years are fetched newest-first so an exhausted budget costs breadth in
the 2000s, not this year's statutes). The `MAX_EVENTS` cap (2500) exempts both
the seed and everything from `KEEP_FROM_YEAR` onwards, so it can only ever cost
historical breadth — never recent law. The resulting dataset is ~2 MB, ~190 kB
gzipped; serve it compressed.

Two checks guard the hand-curated seed. `npm run validate:seed` is offline and
checks the data contract (ids, domains, dates within coverage, summary length,
`id` ↔ statute/CELEX agreement); CI runs it before the build.
`npm run verify:seed` is network-bound and checks the *facts* — that every
statute number resolves in Finlex and every CELEX in CELLAR, with matching
dates — so it is a manual/periodic check, run after seed edits
(`npm run verify:seed -- fi:10/2026` for single entries). Neither can verify a
summary's accuracy; that comes from reading the statute (see `CLAUDE.md`).

> **Oik.ai** (Finnish case-law/legislation MCP server) was evaluated for
> detail-panel enrichment but is **not** browser- or CI-reachable (it is an MCP
> server, not a public HTTP API), so runtime enrichment was intentionally
> dropped rather than shipped broken.

## Running

```sh
npm install
npm run pipeline   # fetch + normalize -> public/data/regulations.v1.json
npm run dev        # (predev runs the pipeline first) http://localhost:5173/Regulaatiotutka/
```

The pipeline takes ~9 min with live Finlex (two sequenced crawls plus a
cooldown). For fast frontend iteration against
an already-generated dataset, run **`npx vite`** directly (skips the pipeline).

```sh
npm run validate:seed  # data-contract check on the committed seed
npm run typecheck  # app + pipeline projects
npm run build      # prebuild pipeline -> typecheck -> vite build into dist/
npm run preview    # serve the production build
```

## Deploy

`.github/workflows/deploy.yml` runs the pipeline + build and publishes `dist/`
to GitHub Pages on push to `main`. The Vite `base` defaults to
`/Regulaatiotutka/`; override with the `VITE_BASE` env var for other hosts
(e.g. `VITE_BASE=/ npm run build` for Netlify root).

Attribution shown in-app footer: *Lähteet: Finlex (avoin data), EUR-Lex /
Euroopan unioni. EuroVoc CC BY. EU-sisältö CC BY 4.0.*

## Versioning

`package.json` `version` plus the short git SHA and build date are injected at
build time (`vite.config.ts` → `__APP_VERSION__` / `__GIT_SHA__` /
`__BUILD_DATE__`) and shown in the in-app **Tietoja** (About) dialog. Vite
content-hashes the JS/CSS filenames every build, so browsers never serve a
stale bundle. Bump the version with `npm run bump` (patch, no git tag).

## Author

Jarmo Annala — <jarmo.annala@idle.fi>
