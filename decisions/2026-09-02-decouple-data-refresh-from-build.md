# 2026-09-02 — Decouple the data refresh from the build

## Decision: `build` and `dev` no longer crawl; `prebuild` resolves the dataset from the local file or a live mirror, and only the monthly schedule / `workflow_dispatch` / `build:all` run the pipeline

## Context

`prebuild` ran the full ~9 min pipeline, so every build crawled Finlex and
EUR-Lex — including builds whose diff was a stylesheet. The UI-only push that
added the Lista view (v0.5.0) re-crawled both sources and republished a
different dataset than the one that had been live.

That is not merely slow. Per the 2026-08-16 record the säädöskokoelma crawl is
throttle-bound and best-effort, so **coverage varies between builds**: an
unrelated push can publish *less* data than is already live, and a run that
gets 429'd hard degrades toward `origin: "seed-fallback"` — an offline banner
shown to users, caused by a CSS change. It also spends rate-limit budget that
the monthly refresh actually needs. Since the monthly cron was added
(2026-09-01), the push-triggered crawl had no remaining justification: data
freshness is a function of time, not of when someone edits the frontend.

## Alternatives considered

- **`actions/cache` for the dataset.** Caches are evicted after 7 days of
  disuse and the cron runs monthly, so the cache would essentially always be
  cold and pushes would silently fall back to the seed. Worst of both.
- **Commit `regulations.v1.json`.** Reproducible, but it breaks the stated
  invariant that the dataset is generated and never a record of anything, and
  churns ~2 MB of JSON through git history every month.
- **Skip the pipeline with an env var** (`SKIP_PIPELINE=1`). Works, but makes
  the safe path the one you have to remember; the failure mode (forgetting) is
  the expensive one.
- **Keep crawling on push, accept the wait.** Rejected: the wait is the least
  of it — the nondeterministic coverage is the real cost.

## Reasoning

`pipeline/ensureData.ts` (run as `prebuild`) resolves the dataset in order:
local file → live mirror → pipeline. The deployed sites already serve
`data/regulations.v1.json` verbatim, so the last published dataset *is* the
artifact store; no new infrastructure, no cache lifetimes, self-healing on a
cold checkout. It validates `schemaVersion` and a non-empty `events` array
before writing, so an HTML error page from a mirror can never land in
`public/data/`, and it falls through to crawling rather than writing garbage.

CI splits on the trigger: `push` → `npm run build` (site only, reuses the
published data), `schedule`/`workflow_dispatch` → `npm run build:all`. Locally
`dev`/`build` are instant and `dev:all`/`build:all` are the explicit refresh.

Measured: a cold-checkout `npm run build` went from ~9 min to **1.4 s**.

## Trade-offs accepted

- **Pages became load-bearing.** It is the first mirror `ensure:data` tries
  (idle.fi is the second). If both were unreachable on a cold CI checkout the
  build would fall back to crawling — slower, but still correct.
- **A code push republishes the previous dataset**, so the *Tietoja* build date
  and the dataset's `generatedAt` now differ. That is the honest reading:
  they were always two different facts.
- **The live site's data is only as fresh as the last cron/dispatch run.** The
  underlying problem — idle.fi refreshing only when a human runs the deploy
  script — is unchanged and wants CI-side deployment (an SSH deploy key) to
  fix properly.
