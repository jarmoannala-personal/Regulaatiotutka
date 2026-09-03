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

## Text for the EU half of the corpus

**Context.** Since 2026-09-03 every crawled Finnish act carries a verbatim
excerpt of its own opening provision (see
`decisions/2026-09-03-statute-excerpts-as-summaries.md`), and the 78 seed acts
carry hand-written prose. The ~1000 EU acts still carry nothing: CELLAR serves
metadata and the document, never an abstract, so `summary: ""` and the panel
says so.

**Options, cheapest first.**

- **Show more of the metadata we already fetch.** EU acts arrive with matched
  EuroVoc concepts (`eurovocIds` in `pipeline/sources/eurlex.ts`) that are
  currently reduced to a domain and thrown away; CELLAR also carries
  `resource_legal_is_about_subject-matter` with Finnish `skos:prefLabel`s
  ("Kuluttajansuoja", "Vapauden, turvallisuuden ja oikeuden alue"). Rendering
  them as topic tags adds real, sourced information for every EU entry. Needs a
  `shared/schema.ts` field and a committed id→label table. Not prose, but not
  nothing.
- **Quote Article 1 the way FI quotes 1 §.** Works today —
  `curl -H 'Accept: application/xhtml+xml' -H 'Accept-Language: fin'
  http://publications.europa.eu/resource/celex/32023R1114` returns the Finnish
  text — but the documents are 0.6–1.7 MB each, so ~1000 of them is a gigabyte
  per build. Would need a wall-clock/byte budget and newest-first ordering like
  the Finlex crawls, covering a slice per build rather than the corpus.
- **The official "Summaries of EU legislation".** CELLAR links them by
  `summary_legislation_eu_summarizes_resource_legal`, and Finnish expressions
  exist ("Yleinen tietosuoja-asetus (GDPR)"). Two problems: coverage is ~17 %
  of our corpus (8 of 47 works sampled for 2018), and the manifestation URIs
  404 on their content datastream, so the text would have to be scraped from
  eur-lex.europa.eu. Highest quality per hit, lowest hit rate.
- **Extend the curated seed.** Highest quality, does not scale: the seed exists
  for landmarks, and hand-writing 2400 summaries is not a maintenance path.
  Worth doing for the acts that matter most to the audience (say the top 150
  by impact tier).
- **Generate summaries from the act text (LLM).** The only option that scales
  to the whole corpus, and the only one that can be *wrong*. This app looks
  authoritative and its verification discipline exists because a fabricated
  reference is worse than a missing one, so this needs: generation from the
  fetched text only (never from the model's own knowledge), a visible
  "koneluettu tiivistelmä" label, the source link next to it, and a spot-check
  pass before publishing. Cost and build time also stop being trivial at 1000+
  acts.

**Also worth doing on the FI side.**

- **Pick the excerpt better.** `pickExcerpt` prefers a purpose/scope heading
  within the first eight sections and otherwise takes the first substantive
  one, which for an act whose 1 § is an organisational detail is not the most
  descriptive provision available.
- **Show the excerpt in the list view.** The rows carry title + facets only;
  a clamped first line of the excerpt would make browsing far more useful.
