# Regulaatiotutka — Regulation Radar

A mostly-frontend web app that makes Finnish and EU **legislative change legible
over time**, focused on what matters to companies (oy, oyj, tmi, säätiö,
yhdistys): corporate governance, tax, accounting, employment, data protection,
financial/securities, competition and environment.

The centrepiece is a **sweep radar**: radial distance encodes time
(outer = newer), angular sectors encode a switchable category
(legal domain / Finland vs EU / impact). A timeline scrubber is the primary
control — drag it across 2000→today, or hit Play to auto-sweep while sectors
"flash" as changes enter the window. Hover a blip for a summary, click for the
official source.

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
| [EUR-Lex / CELLAR SPARQL](https://publications.europa.eu/webapi/rdf/sparql) | EU regulations & directives, EuroVoc-tagged | metadata CC0, content CC BY 4.0 |
| [Finlex open data](https://opendata.finlex.fi) | Finnish consolidated statutes (Akoma Ntoso XML) | open data, attribute Finlex |
| Committed seed (`pipeline/seed/seed-events.json`) | ~50 curated landmark FI/EU acts; offline fallback | hand-curated |

The pipeline merges the seed in every run for baseline coverage and **always
exits 0**: if both live sources are unreachable it writes the seed with
`origin: "seed-fallback"` and the UI shows an offline banner. Finlex is
rate-limited (HTTP 429) and capped by a wall-clock budget, so live FI breadth
varies run to run — the seed guarantees the important laws are always present.

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

The pipeline takes ~3 min with live Finlex. For fast frontend iteration against
an already-generated dataset, run **`npx vite`** directly (skips the pipeline).

```sh
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
