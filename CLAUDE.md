# CLAUDE.md — Regulaatiotutka

Project memory for Claude Code. General working preferences live in
`~/dev/claude-memory/`; source-API gotchas for Finlex and EUR-Lex live in
`~/dev/claude-memory/finlex-opendata-api.md`. This file holds what is specific
to **this** repo.

## What this is

A static, backend-free visualization of Finnish and EU legislative change
2000→current year, aimed at companies (see `README.md` for the product story
and the three views). Vite + TypeScript + D3, no UI framework.

## Deployment: two targets, and the live one is manual

- **auski.idle.fi is the site people actually look at**:
  `https://auski.idle.fi/Regulaatiotutka/`. `./push_to_idle.sh` scp's `dist/*`
  to `auski@idle.fi:~/reg/`, which the host serves at the `/Regulaatiotutka/`
  URL path. That means the default Vite `base` (`/Regulaatiotutka/`) is already
  correct for this target — **do not** set `VITE_BASE` for it, or every asset
  404s.
- **The script publishes, it does not build.** It copies whatever is sitting in
  `dist/`. `npm run build` is now seconds and does **not** crawl — it keeps the
  dataset already on disk (`prebuild` = `ensure:data`). Use `npm run build:all`
  when the point is fresh data (~9 min). The in-app *Tietoja* build date and
  the dataset's own `generatedAt` are separate for exactly this reason.
- **GitHub Pages** (`jarmoannala-personal.github.io/Regulaatiotutka/`) is built
  by `.github/workflows/deploy.yml` on push to `main`, on the monthly cron
  (`0 5 1 * *`), or via `workflow_dispatch`. **Only the cron and
  `workflow_dispatch` crawl** (`build:all`); a push rebuilds the site and
  reuses the dataset already published, fetched by `ensure:data` from the live
  mirrors. Pages is therefore load-bearing: it is the first mirror
  `ensure:data` tries (idle.fi is the second). Pages was only enabled on
  2026-09-01; every earlier run failed at `configure-pages@v5` because the repo
  had no Pages site, which went unnoticed precisely because idle.fi is the real
  deployment.
- **The two copies drift.** Pages refreshes itself monthly; idle.fi refreshes
  only when someone builds and runs the script.

## Data model: the seed is the source of truth

- `pipeline/seed/seed-events.json` is **hand-curated and committed** — 78
  landmark FI/EU acts with hand-written Finnish summaries and deliberate impact
  tiers. It is the offline fallback and the baseline coverage promise.
- `public/data/regulations.v1.json` is **generated and gitignored**. Never edit
  it, and never treat it as a record of anything — every build overwrites it.
- `shared/schema.ts` is the single contract shared by pipeline and frontend.
  Changing it means changing both sides.
- **The seed wins field-by-field on id clashes** (`mergeSeed(live, seed)`):
  every value the seed states — summary, impact tier, domain, title — survives
  a crawl of the same act, and the live record only fills in what the seed
  leaves empty (`amendedSections`, `eli`). Until 2026-09-03 the merge was the
  other way round (`dedupeEvents(live, seed)`, live wins the whole record),
  which silently replaced **46 of the 78 hand-written summaries** with the
  statute's own title on every build. A crawl can never write a summary, so it
  must never overwrite one. The pipeline logs
  `curated summaries kept: 78/78` and warns if any are lost.
- Seed ids are also exempt from the `MAX_EVENTS` cap
  (`capEvents(..., seedIds)`), so a growing live result set can never push a
  curated landmark off the radar.
- **Three kinds of summary, and `summarySource` says which.** `curated` is the
  seed's hand-written prose. `excerpt` is a **verbatim quote of the statute's
  own opening provision** (usually "1 § Lain tarkoitus" / "Soveltamisala"),
  lifted from the Finlex document the crawl already downloads — real text the
  pipeline cannot get wrong because it did not write it. Neither means
  `summary: ""`: EU acts (CELLAR publishes no abstract) and FI documents with
  no usable section. The UI renders an excerpt as a blockquote labelled "Ote
  säädöstekstistä, 1 § …", curated prose as a plain paragraph, and nothing as
  a plain note — never the title twice. `hasSummary()` in `src/util/format.ts`
  is what asks; it trusts `summarySource` and falls back to the old
  title-vs-summary prefix comparison for a dataset published before
  2026-09-03. See `decisions/2026-09-03-statute-excerpts-as-summaries.md`.
- **Excerpts need the order-preserving parse.** `extractExcerpts()` in
  `sources/finlex.ts` re-parses each result page with `preserveOrder: true`,
  because the default `fast-xml-parser` config groups children by tag name and
  so lifts inline `<ref>` citations out of their sentence ("passilain1
  momentissa" for "passilain (671/2006) 1 momentissa"). Never quote statute
  text from the other parse.

### Editing the seed — verification is mandatory

Wrong statute numbers, rates and dates are the failure mode that matters here:
this app looks authoritative, so a fabricated reference is worse than a missing
one. A 2026-08 audit found a VAT entry whose statute number pointed at an
unrelated kipsikäsittely subsidy decree, plus four dates taken from OJ
publication instead of adoption.

**Never write a statute number, rate, date or summary from memory.** Fetch the
act and read it:

```sh
# statute as published (this is where amendment laws live)
curl -s "https://opendata.finlex.fi/finlex/avoindata/v1/akn/fi/act/statute/2025/1390/fin@"
```

Then run both checks:

```sh
npm run validate:seed   # offline: shape, ids, domains, dates in range, summary ≤280
npm run verify:seed     # network: every statuteNumber/CELEX resolves, dates match source
npm run verify:seed -- fi:10/2026 eu:32026L0470   # just the entries you touched
```

`validate:seed` runs in CI before the build. `verify:seed` is network-bound and
rate-limited, so it is manual/periodic — run it after every seed edit and
occasionally to catch drift. **Neither script can check whether a summary is
*true*** — that is on the author, from the statute text.

Conventions for new entries:

- FI id `fi:{statuteNumber}`, EU id `eu:{celex}` — `validate:seed` enforces the
  match.
- `dateAnnounced` = Finlex `dateIssued` / CELLAR `work_date_document`
  (**adoption**, not OJ publication) so seed and live data land on the same
  point of the timeline.
- Source URLs: `finlex.fi/fi/lainsaadanto/{year}/{num}` (consolidated) or
  `…/lainsaadanto/saadoskokoelma/{year}/{num}` (as published); EUR-Lex
  `legal-content/FI/TXT/?uri=CELEX:{celex}`. The old `/fi/laki/ajantasa/…`
  paths only 308-redirect.
- Summaries: Finnish, ≤280 chars, plain language, state what changed and for
  whom. Finnish typography — en dash `–` not `—`, comma before *vaan*/*mutta*,
  `25,5 %` with a space.
- Only the eight domains in `shared/schema.ts`. If a law does not fit one, leave
  it out rather than forcing a misleading tag (that is why the CER critical-
  infrastructure act and Yleistukilaki are not in the seed — and note
  Yleistukilaki 48/2026 is unemployment benefit, not business subsidy).

## Pipeline behaviour worth knowing

- `TO_YEAR` derives from the current year — do not pin it again.
- **Three live sources.** Finlex `statute-consolidated` (acts in force, all
  years), Finlex `statute` = säädöskokoelma (recent amending acts — the
  consolidated set never contains "Laki X:n muuttamisesta", so without this
  crawl no amendment is visible), and EUR-Lex CELLAR.
- **The two Finlex crawls must stay sequential, amendments first, with
  `FINLEX_COOLDOWN_MS` between them.** In parallel they 429 each other out
  ("all years failed"); back to back, the consolidated crawl's throttling
  swallows the amendment crawl whole. Both failure modes were observed.
  Amendments go first because they are the freshest and the scarcest.
- Finlex fetches **newest year first** under a per-crawl wall-clock budget, so a
  throttled run loses breadth in the 2000s rather than this year's statutes.
  Expect the amendment crawl to cover roughly the current year per build —
  Finlex's throttle allows only a few hundred requests before 429s, and the
  säädöskokoelma returns every statute **twice** at 10 per page (an API quirk,
  not filterable), so a single year is ~300 pages.
- Finlex 429s are aggressive and any bulk scan poisons the next few minutes;
  backoff is seconds with `Retry-After`. If a local run shows many
  "429 backoff exhausted" lines, wait before re-running rather than tuning.
- `MAX_EVENTS` (2500) exempts the seed **and** everything from `KEEP_FROM_YEAR`
  onwards. The cap may only cost historical breadth, never recent law.
- Amendment metadata is parsed, not given: the säädöskokoelma carries no
  `inForce` field, so `dateInForce` comes from the statute's own closing
  formula ("Tämä laki tulee voimaan 1 päivänä tammikuuta 2026") and
  `amendedSections` from the title. Both parsers — and `pickExcerpt` /
  `extractExcerpts` — are exported from `sources/finlex.ts` and are the right
  place to add a regression test if they ever misfire.
- The pipeline **always exits 0**. A data-source outage must never fail the
  build — it degrades to `origin: "seed-fallback"` and the UI shows a banner.
- `pipeline/normalize/domainMap.ts` is what decides whether a live law appears
  at all. Finnish inflection matters: `\bdata\b` never matches "datan". When a
  known law is missing from the dataset, check this file first.
- `npm run dev` and `npm run build` no longer crawl; `dev:all` / `build:all`
  are the explicit refresh paths. `pipeline/ensureData.ts` is what makes that
  safe — local file, then live mirror, then (cold checkout only) the crawl.
  It validates what a mirror serves before writing, so an HTML error page can
  never land in `public/data/`.

## URL fragment = shareable state

`src/state/urlState.ts` mirrors the shareable subset of the store (view,
dimension, filters, list sort, query, selected act, timeline cursor) into
`location.hash`, e.g. `#view=list&jur=FI&id=fi:1390/2025`. Two rules worth
keeping: **a link is a snapshot** — any shared key the fragment omits is at its
*default*, not at whatever the recipient's localStorage has, so the sender and
the recipient see the same page; and **only non-default values are written**,
so the default state has no fragment at all. Play mode and speed stay
device-local; the graph's zoom is not state. The codec is pure and covered by
`npm test` (node:test via tsx, `tsconfig.test.json`). See
`decisions/2026-09-04-url-fragment-state.md`.

## Conventions

- Version bumps: `npm run bump` (patch) or edit `version` for a minor; the
  version, git SHA and build date show in the in-app *Tietoja* dialog.
- Significant decisions go in `decisions/YYYY-MM-DD-{topic}.md`.
- Non-urgent follow-ups go in `IDEAS.md` (nothing there is committed work).
