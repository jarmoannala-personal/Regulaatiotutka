import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { RegulationEvent } from "../shared/schema.js";
import { refreshKeywordDomains } from "./archive.js";

function event(over: Partial<RegulationEvent>): RegulationEvent {
  return {
    id: "fi:1/2020",
    title: "Laki jostakin",
    jurisdiction: "FI",
    domain: "corporate_governance",
    impactTier: "low",
    dateAnnounced: "2020-01-01",
    dateInForce: null,
    sourceUrl: "https://www.finlex.fi/fi/lainsaadanto/2020/1",
    summary: "",
    instrumentType: "act",
    domainConfidence: "keyword",
    ...over,
  };
}

test("an archived record is re-tagged when the rules moved it", () => {
  const archived = event({
    title: "Sosiaali- ja terveysministeriön asetus työntekijän eläkelain mukaisesta maksusta",
    domain: "financial_securities",
  });
  const { events, retagged, dropped } = refreshKeywordDomains([archived]);
  assert.equal(events[0].domain, "employment_labour");
  assert.equal(retagged, 1);
  assert.equal(dropped, 0);
});

test("a EuroVoc-tagged record is left alone", () => {
  const tagged = event({
    id: "eu:32016R0679",
    jurisdiction: "EU",
    title: "Yleinen tietosuoja-asetus",
    domain: "corporate_governance",
    domainConfidence: "tagged",
  });
  const { events, retagged } = refreshKeywordDomains([tagged]);
  assert.equal(events[0].domain, "corporate_governance");
  assert.equal(retagged, 0);
});

test("a record the rules no longer place at all is dropped", () => {
  const stale = event({ title: "Laki perusopetuslain muuttamisesta" });
  const { events, dropped } = refreshKeywordDomains([stale]);
  assert.deepEqual(events, []);
  assert.equal(dropped, 1);
});

test("a record the rules still agree with is untouched", () => {
  const stable = event({
    title: "Laki työsopimuslain 7 luvun muuttamisesta",
    domain: "employment_labour",
  });
  const { events, retagged, dropped } = refreshKeywordDomains([stable]);
  assert.equal(events.length, 1);
  assert.equal(retagged + dropped, 0);
});

test("a curated id is neither re-tagged nor dropped", () => {
  const curated = [
    event({ id: "fi:10/2026", title: "Rahapelilaki", domain: "competition" }),
    event({
      id: "fi:1171/2022",
      title: "Laki Euroopan unionin ja kansallisen oikeuden rikkomisesta ilmoittavien henkilöiden suojelusta",
      domain: "corporate_governance",
    }),
  ];
  const { events, retagged, dropped } = refreshKeywordDomains(
    curated,
    new Set(["fi:10/2026", "fi:1171/2022"]),
  );
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.domain), ["competition", "corporate_governance"]);
  assert.equal(retagged + dropped, 0);
});
