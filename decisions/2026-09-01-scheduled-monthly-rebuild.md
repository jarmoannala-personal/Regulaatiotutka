# 2026-09-01 — Scheduled monthly rebuild

## Decision: add a monthly `schedule:` trigger to the Pages workflow, and ship the August maintenance pass that had never been pushed

## Context

A month-boundary check for new law turned up two different things.

The small one: nothing was missing. Finlex statutes 738–765/2026
(2026-07-15 → 2026-08-27) are the summer recess — hunting-season and ASF
tartuntavyöhyke decrees, ministry asetukset, three non-business acts
(738, 739, 757). EUR-Lex over the same window is ~85 corrigenda plus
sanctions regulations; the three genuine new acts (2026/1743 VAT-data
access for EPPO/OLAF, 2026/1768 CAP, 2026/1881 ePrivacy derogation) are
too sector-narrow for the curated seed. No seed edit was warranted.

The large one: the deployed site was running the 2026-05-17 commit. The
whole 2026-08-16 pass — the säädöskokoelma crawl, the recency bias, 28
net new seed entries, both seed checks — sat uncommitted in the working
tree for two weeks. Since `deploy.yml` triggered only on `push`, the live
dataset was as old as the last commit, and had never contained a single
live amendment.

## Alternatives considered

- **Keep the manual cadence** (check when a month turns, push if
  something changed). That is exactly the process that had just failed:
  the data was stale for a reason unrelated to whether new law existed.
- **Daily or weekly cron.** Finnish statutes are confirmed in batches,
  and each run costs ~9 min of Finlex crawling against a service that
  429s aggressively. Daily spends the rate-limit budget for no extra
  signal.
- **Cron the pipeline only, committing the generated JSON.** Rejected:
  `regulations.v1.json` is generated and gitignored on purpose. Making it
  a committed artefact would put a 2 MB diff in every run's history and
  give the file a second, contradictory identity.

## Reasoning

Deploying *is* the refresh — the pipeline runs at build time, so a push
is the only thing that updates the data. That coupling is fine, but it
should not be the only trigger, because it makes data freshness a
side-effect of unrelated code changes. `0 5 1 * *` decouples them: the
1st of each month, 08:00 Helsinki, one crawl covering the current year.

Monthly matches the grain of the source. It also matches the seed's role:
between rebuilds the curated 78 acts are the coverage promise, and they
do not go stale.

## Trade-offs accepted

- **Up to a month of lag** on a genuinely urgent law. Acceptable for a
  radar of legislative change, and `workflow_dispatch` still forces a run.
- **GitHub disables scheduled workflows after 60 days without repo
  activity.** A dormant repo therefore stops refreshing silently — the
  in-app *Tietoja* build date is the only signal.
- **A scheduled build can deploy a worse dataset than the last one.** The
  pipeline always exits 0, so a Finlex outage degrades to
  `seed-fallback` and publishes it. That is the intended failure mode,
  but it now happens unattended.
