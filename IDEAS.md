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
