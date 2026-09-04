import type { Domain } from "../../shared/schema.js";

/**
 * EuroVoc concept id -> our domain. Ids were resolved empirically against the
 * CELLAR SPARQL endpoint by English skos:prefLabel (see pipeline probes).
 * This doubles as the SPARQL allow-list that bounds the EU result set.
 */
export const EUROVOC_TO_DOMAIN: Record<string, Domain> = {
  // corporate / governance
  "554": "corporate_governance", // company law
  "524": "corporate_governance", // commercial law
  "1122": "corporate_governance", // merger
  "2889": "corporate_governance", // business name
  "960": "corporate_governance", // bankruptcy
  // tax & duties
  "561": "tax_duties", // tax law
  "1313": "tax_duties", // direct tax
  "1331": "tax_duties", // corporation tax
  "924": "tax_duties", // tax avoidance
  "4585": "tax_duties", // VAT
  "4392": "tax_duties", // VAT rate
  // accounting & reporting
  "54": "accounting_reporting", // accounting
  "4675": "accounting_reporting", // auditing
  "7942": "accounting_reporting", // corporate social responsibility
  // employment & labour
  "557": "employment_labour", // labour law
  "82": "employment_labour", // working conditions
  // data protection
  "5181": "data_protection", // data protection
  "5595": "data_protection", // personal data
  "3030": "data_protection", // artificial intelligence
  // financial & securities
  "1804": "financial_securities", // financial market
  "560": "financial_securities", // financial legislation
  "4646": "financial_securities", // securities
  "2149": "financial_securities", // banking
  "3246": "financial_securities", // credit institution
  "3942": "financial_securities", // financial solvency
  "5465": "financial_securities", // money laundering
  // competition
  "75": "competition", // competition
  // environment
  "2470": "environment", // environmental policy
  "2825": "environment", // environmental protection
  "1158": "environment", // waste management
  "2524": "environment", // pollution
};

/** Full EuroVoc concept URIs for the SPARQL `IN (...)` filter. */
export const EUROVOC_ALLOW_URIS: string[] = Object.keys(
  EUROVOC_TO_DOMAIN,
).map((id) => `<http://eurovoc.europa.eu/${id}>`);

/**
 * Pick a domain from a work's EuroVoc concept ids. When several map to
 * different domains, the first by the order they appear in
 * {@link EUROVOC_TO_DOMAIN} wins (stable, deterministic).
 */
export function domainFromEurovoc(conceptIds: string[]): Domain | null {
  const order = Object.keys(EUROVOC_TO_DOMAIN);
  let best: { idx: number; domain: Domain } | null = null;
  for (const id of conceptIds) {
    const domain = EUROVOC_TO_DOMAIN[id];
    if (!domain) continue;
    const idx = order.indexOf(id);
    if (!best || idx < best.idx) best = { idx, domain };
  }
  return best?.domain ?? null;
}

/**
 * Keyword fallback for FI statutes (and EU titles lacking a mapped concept).
 *
 * **Order is the tie-breaker**: `domainFromTitle` returns the first rule that
 * matches, so a title naming both a levy and an employment relationship lands
 * in the domain listed first. `data_protection` stays ahead of
 * `employment_labour` so "yksityisyyden suojasta työelämässä" keeps its
 * privacy tag; `employment_labour` sits ahead of `tax_duties`.
 */
export const FI_KEYWORD_RULES: { domain: Domain; pattern: RegExp }[] = [
  {
    domain: "data_protection",
    // `data\w*` (not `\bdata\b`) so Finnish inflections like "datan" match.
    pattern:
      /tietosuoja|henkilötiet|yksityisyy|tekoäly|\bdata\w*|tietoturv|kyberturv|kyberkestäv/i,
  },
  {
    domain: "accounting_reporting",
    pattern: /kirjanpit|tilinpäätös|tilintarkast|kestävyysrapor|raportoin/i,
  },
  {
    // Before `tax_duties`: an employer obligation is workforce law even when
    // it is collected as a levy ("työnantajan sairausvakuutusmaksu"), and the
    // tax pattern's standalone `maksu` would otherwise take it.
    domain: "employment_labour",
    // Deliberately broad on `työntekij`/`työnantaj`: a statute naming either
    // party of an employment relationship is one a company's HR lives under.
    // `työeläke`, not bare `eläke` — pension *funds* are financial law.
    pattern:
      /työsopimu|työsuhde|työaika|työturvalli|työsuojelu|työterveys|työtapaturma|ammattitaut|yhteistoiminta|työehto|työriit|työntekij|työnantaj|työvoima|työeläke|työttömyystur|työttömyysvakuut|palkkatur|palkkaus|palkkatiet|palkkasaat|vuosilom|lomautu|irtisanomis|perhevapa|vanhempainvapa|vuorotteluvapa|opintovapa|vuokratyö|kilpailukielto|yhdenvertaisuus|tasa-arvo|ilmoittaja/i,
  },
  {
    domain: "tax_duties",
    // `\bmaksu(t|…)\b` only as a standalone word: bare `maksu` used to swallow
    // maksupalvelu-, seuraamusmaksu- and asiakasmaksu-titles into tax.
    pattern:
      /\bvero|arvonlisävero|tulovero|valmistevero|verotus|tullin?|\bmaksu(t|ja|jen|ista|sta|n)?\b/i,
  },
  {
    domain: "financial_securities",
    pattern:
      /arvopaperi|sijoitus|luottolaito|luotonost|luotonhallinnoi|rahanpes|maksupalvelu|rahoitus|vakuutus|pankki|kryptovara|virtuaalivaluutta/i,
  },
  {
    domain: "competition",
    pattern: /kilpailu|hankintalaki|julkiset hankinnat|valtiontuk/i,
  },
  {
    domain: "environment",
    pattern: /ympäristö|jäte|päästö|luonnonsuojelu|ilmasto|kierrätys/i,
  },
  {
    domain: "corporate_governance",
    pattern:
      /osakeyhti|yhtiölaki|säätiö|yhdistys|liikesalaisuus|tavaramerkki|kaupparekisteri|elinkeino|yritys|maksukyvyttöm|konkurssi|yrityssaneeraus/i,
  },
];

export function domainFromTitle(title: string): Domain | null {
  for (const rule of FI_KEYWORD_RULES) {
    if (rule.pattern.test(title)) return rule.domain;
  }
  return null;
}
