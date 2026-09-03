# Follow-up ideas

Non-urgent improvements parked for later. Nothing here is committed work.

## Make the graph view's data basis visible

**Context.** The graph-view connections are *hard data*, not topic-similarity
wiring. Edges come from EUR-Lex / CELLAR via SPARQL
(`pipeline/sources/eurlexEdges.ts`), using the CDM ontology predicates
`resource_legal_amends_resource_legal` / `..._repeals_...` /
`..._based_on_...` — the same official relationship metadata that drives the
"amended by / repealed by" boxes on eur-lex.europa.eu. Two laws get an edge
only if EUR-Lex explicitly records the relationship; shared domain / EuroVoc
tags / title keywords produce **no** edge. Both endpoints must be events we
already keep (`celexSet`), so the graph only shows relationships among laws
already on screen.

Because it is data-based, we should surface that to the user instead of
leaving the network looking like an inferred similarity graph.

**Possible changes (pick any):**

- Edge-type legend in graph view: sininen = *muuttaa*, punainen = *kumoaa*,
  vihreä = *perustuu* (colours already exist; just no key).
- Tooltip / detail panel note: "Suhde EUR-Lexin metatiedoista (CDM)" so users
  know the link is official, not inferred.
- Flag the **EU-only scope**: edges exist only between `eu:${celex}` events.
  Finnish statutes aren't connected — Finlex amendment relations
  (`activeModifications` / `passiveModifications`) are parsed into each
  event's `amendedSections` but not emitted as graph edges. Without a note,
  the absence of FI links can be misread as "no relationships."

**Stretch:** emit Finlex amendment relations as graph edges too, so FI law
gets a real (not inferred) network as well.

## Publish to idle.fi from CI

**Context.** `./push_to_idle.sh` is the only thing that refreshes
`auski.idle.fi/Regulaatiotutka/` — the site people actually look at — so it is
as fresh as the last time a human ran `npm run build:all` and the script. The
monthly cron (`0 5 1 * *`) does refresh the data, but only for the Pages copy,
which nobody visits. That is backwards: the automated refresh benefits the
mirror, the manual one carries the live site.

Since 2026-09-02 a push builds in ~40 s and only the cron/`workflow_dispatch`
crawl (see `decisions/2026-09-02-decouple-data-refresh-from-build.md`), so CI
is now cheap enough to publish on every run.

**Sketch.** Add a deploy step that scp's `dist/*` to `auski@idle.fi:~/reg/`,
same as the script:

- generate a dedicated keypair, put the public key in the `auski` account's
  `~/.ssh/authorized_keys`, the private key in a repo secret
  (`IDLE_SSH_KEY`), and the host key in another (`IDLE_KNOWN_HOSTS`) rather
  than using `StrictHostKeyChecking=no`;
- restrict the key in `authorized_keys` (`command=`/`restrict`) so it can only
  write that directory — it is a personal server, and a repo secret is a
  broader blast radius than a local ssh-agent;
- keep `push_to_idle.sh` working for manual/emergency deploys.

**Open questions.** Whether every push should hit the personal server or only
the cron + `workflow_dispatch` (the data refreshes are what actually matter
there). Whether Pages then stays as a mirror — it is currently load-bearing as
the first mirror `ensure:data` reads, so dropping it means pointing that at
idle.fi instead.

## Real summaries for crawled law

**Context.** Only the 78 curated seed acts have a written summary. For
everything the pipeline crawls, `summary: shorten(title)` — the title again —
so ~97 % of the dataset has no description. Neither source API offers one:
Finlex serves the statute text, EUR-Lex/CELLAR serves metadata plus the
document, and neither publishes an abstract. Since 2026-09-03 the UI is honest
about it (`hasSummary()`), which is a floor, not a fix.

**Options, cheapest first.**

- **Show more of the metadata we already fetch.** EU acts arrive with matched
  EuroVoc concepts (`eurovocIds` in `pipeline/sources/eurlex.ts`) that are
  currently reduced to a domain and thrown away. Storing the matched concepts
  and rendering them as topic tags ("arvonlisävero · verotusmenettely") adds
  real, sourced information for the ~1000 EU entries. Needs a `shared/schema.ts`
  field, a committed id→Finnish-label table, and a data rebuild. No prose.
- **Derive a sentence from structure, not meaning.** For FI amendments the
  title already names the act and the pipeline parses `amendedSections` and the
  commencement date, so a template can state "Muuttaa lakia X, kohdat 1:3 ja
  5:2, voimaan 1.1.2026." True by construction, but it only restates fields the
  panel shows separately — thin value.
- **Extend the curated seed.** Highest quality, does not scale: the seed exists
  for landmarks, and hand-writing 2400 summaries is not a maintenance path.
  Worth doing for the acts that matter most to the audience (say the top 150
  by impact tier) and leaving the rest honestly empty.
- **Generate summaries from the statute text (LLM).** The only option that
  scales to the whole corpus, and the only one that can be *wrong*. This app
  looks authoritative and its whole verification discipline exists because a
  fabricated reference is worse than a missing one, so this needs: generation
  from the fetched statute text only (never from the model's own knowledge), a
  visible "koneluettu tiivistelmä" label, the source link next to it, and a
  spot-check pass before publishing. Cost and build time also stop being
  trivial at 2400 acts.

**Open question.** Whether the product wants a description for every act at
all, or whether "what changed, when, in which area, link to the source" is the
honest scope — with curated prose only where a human has actually read the act.
