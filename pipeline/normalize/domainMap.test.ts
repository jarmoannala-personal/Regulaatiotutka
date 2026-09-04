import { strict as assert } from "node:assert";
import { test } from "node:test";
import { domainFromTitle } from "./domainMap.js";

test("employment law is recognised by either party of the work relationship", () => {
  for (const title of [
    "Laki työntekijöiden lähettämisestä annetun lain 4 ja 6 §:n muuttamisesta",
    "Laki työsopimuslain 7 luvun muuttamisesta",
    "Laki vuosilomalain muuttamisesta",
    "Laki työntekijän eläkelain muuttamisesta",
    "Laki työttömyysturvalain 6 luvun 8 §:n muuttamisesta",
    "Laki tasa-arvovaltuutetusta annetun lain 1 §:n muuttamisesta",
    "Laki yhdenvertaisuusvaltuutetusta annetun lain 1 §:n muuttamisesta",
  ]) {
    assert.equal(domainFromTitle(title), "employment_labour", title);
  }
});

test("an employer levy is workforce law, not tax", () => {
  // The tax rule's standalone `maksu` used to take these first.
  assert.equal(
    domainFromTitle("Laki työnantajan sairausvakuutusmaksusta annetun lain muuttamisesta"),
    "employment_labour",
  );
  assert.equal(
    domainFromTitle(
      "Sosiaali- ja terveysministeriön asetus työntekijän eläkelain mukaisen työnantajakohtaisen vakuutuskannan arvosta",
    ),
    "employment_labour",
  );
});

test("tax and financial titles without a work relationship are untouched", () => {
  assert.equal(domainFromTitle("Laki arvonlisäverolain 59 §:n muuttamisesta"), "tax_duties");
  assert.equal(domainFromTitle("Laki tuloverolain muuttamisesta"), "tax_duties");
  assert.equal(
    domainFromTitle("Laki luottolaitostoiminnasta annetun lain muuttamisesta"),
    "financial_securities",
  );
});

test("privacy at work stays a data protection matter", () => {
  // `data_protection` is listed before `employment_labour` for exactly this.
  assert.equal(
    domainFromTitle("Laki yksityisyyden suojasta työelämässä annetun lain muuttamisesta"),
    "data_protection",
  );
});

test("statutes outside the eight domains are still dropped", () => {
  for (const title of [
    "Valtioneuvoston asetus vuodelta 2025 maksettavasta pohjoisesta tuesta",
    "Laki perusopetuslain muuttamisesta",
  ]) {
    assert.equal(domainFromTitle(title), null, title);
  }
});
