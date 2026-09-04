# Regulaatiotutka — Regulation Radar

A mostly-frontend web app that makes Finnish and EU **legislative change legible
over time**, focused on what matters to companies (oy, oyj, tmi, säätiö,
yhdistys): corporate governance, tax, accounting, employment, data protection,
financial/securities, competition and environment.

A timeline scrubber (2000→2026, with 0.1×–4× auto-play) is the primary
control across four switchable **views**, all sharing the same dimension
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
- **Lista (list)** — every match newest-first, with month dividers, heavier
  sticky year dividers, an FI/EU badge per row and incremental rendering
  (200 rows per chunk, extended on scroll — no pagination). Filtering lives
  in the dock, which in this view lists **every** facet (domain, FI/EU,
  impact) rather than only the sector dimension, so the list's own toolbar
  carries nothing but the sort control. *Järjestys* switches between the date given
  (**Annettu**, the date the rest of the app uses) and the date it takes
  effect (**Voimaan**), which floats not-yet-in-force law to the top and
  collects open-ended commencements in a trailing group. The one view that
  ignores the timeline cursor: it browses the whole corpus, so the timeline
  bar and the dock feed hide while it is open.

Hover any item for its details, click for the official source. The text under
a heading is one of two things, and the app always says which: hand-written
prose for the 78 curated acts, or a **verbatim quote of the statute's own
opening provision** ("Ote säädöstekstistä, 1 § Lain tarkoitus") for a crawled
Finnish act. Nothing is ever generated. EU acts have neither — CELLAR
publishes no abstract — and the app says so rather than echoing the title. A right-hand
dock holds a free-text search, the legend (click to filter — every facet at
once in Lista, the sector dimension elsewhere), and a timeline-following feed
of the legislation as it appears. The search has a
hand-curated EN/acronym↔Finnish + CELEX alias map, so "gdpr", "ai act" or
"tax" hit the Finnish corpus.

## Architecture

- **No runtime backend.** A build-time pipeline (`pipeline/`) fetches and
  normalizes open data into a single static `public/data/regulations.v1.json`
  the frontend loads. Settings persist in `localStorage`; the shareable part
  of them (view, filters, search, selected act, timeline cursor) also mirrors
  into the URL fragment, so the address bar is always a link to what is on
  screen — `…/#view=list&jur=FI&id=fi:1390/2025` opens the list, Finnish law
  only, with that act selected, on any host.
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
npm run dev        # http://localhost:5173/Regulaatiotutka/ — no crawl
npm run build      # typecheck -> vite build into dist/ — no crawl
```

**Nothing crawls implicitly.** Data freshness is a function of time, not of
when someone edits a stylesheet, so the ~9 min pipeline is never a side effect
of building. `prebuild` runs `ensure:data`, which resolves the dataset in
order: the local file, then the copy on a live mirror (both deployed sites
serve it verbatim; `DATA_URL` overrides), and only crawls on a cold checkout
with no mirror reachable.

Refreshing the data is the explicit path:

```sh
npm run pipeline   # crawl + normalize -> public/data/regulations.v1.json (~9 min)
npm run build:all  # pipeline, then build
npm run dev:all    # pipeline, then dev server
npm run ensure:data  # dataset without crawling (what prebuild runs)
```

```sh
npm run validate:seed  # data-contract check on the committed seed
npm run typecheck  # app + pipeline projects
npm run preview    # serve the production build
```

## Deploy

Two targets.

**auski.idle.fi** — <https://auski.idle.fi/Regulaatiotutka/>, the live site.
`./push_to_idle.sh` scp's `dist/*` to `auski@idle.fi:~/reg/`, served at the
`/Regulaatiotutka/` path. It publishes, it does not build: run `npm run build`
for a code change (seconds, keeps the current data) or `npm run build:all` to
ship fresh data.

**GitHub Pages** — `.github/workflows/deploy.yml` publishes `dist/` on push to
`main`, on a monthly schedule (`0 5 1 * *`) and on `workflow_dispatch`. Code
pushes rebuild the *site* and republish the dataset that is already live; the
schedule and manual runs are what refresh the *data* (`npm run build:all`).
Pushes therefore never re-roll the throttle-bound amendment crawl, which could
otherwise publish less data than is already live.

Both targets sit under a `/Regulaatiotutka/` path, which is what the Vite `base`
default assumes. Override with the `VITE_BASE` env var only for a host that
serves from somewhere else (e.g. `VITE_BASE=/ npm run build` for Netlify root).

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
