import type { RegulationDataset, RegulationEvent } from "../../shared/schema";
import { DOMAIN_LABELS } from "../../shared/schema";
import { hasSummary } from "../util/format";

/**
 * The full-screen documentation, opened from the About dialog.
 *
 * Everything factual about coverage is read from the dataset that is actually
 * loaded — counts, per-year breadth, the build's own `generatedAt` and
 * `sourceVersion` — so the page cannot drift from the data the way a written
 * number would. The prose describes what the pipeline does; the figures
 * describe what this particular build got.
 */

const REPO_URL = "https://github.com/jarmoannala-personal/Regulaatiotutka";

const dateTimeFmt = new Intl.DateTimeFormat("fi-FI", {
  dateStyle: "long",
  timeStyle: "short",
});
const numFmt = new Intl.NumberFormat("fi-FI");

interface YearRow {
  year: number;
  fi: number;
  eu: number;
}

interface Stats {
  total: number;
  fi: number;
  eu: number;
  edges: number;
  fromYear: number;
  toYear: number;
  generatedAt: string;
  sources: string[];
  byDomain: { label: string; n: number }[];
  byYear: YearRow[];
  withSummary: number;
  curated: number;
  excerpts: number;
  withInForce: number;
  amendments: number;
  thinnestYears: YearRow[];
}

/** Human-readable names for the `sourceVersion` tokens the pipeline writes. */
const SOURCE_LABELS: Record<string, string> = {
  "finlex-rest-v1": "Finlex – konsolidoidut säädökset",
  "finlex-saadoskokoelma": "Finlex – säädöskokoelma (muutoslait)",
  "eurlex-cellar": "EUR-Lex / CELLAR",
};

function describeSource(token: string): string {
  if (SOURCE_LABELS[token]) return SOURCE_LABELS[token];
  if (token.startsWith("archive-")) {
    return `Edellinen julkaistu aineisto (${token.slice("archive-".length)})`;
  }
  if (token.startsWith("seed-")) return "Käsin koostettu siemendata";
  return token;
}

function collect(dataset: RegulationDataset): Stats {
  const events = dataset.events;
  const { fromYear, toYear } = dataset.coverage;

  const byYear: YearRow[] = [];
  for (let year = fromYear; year <= toYear; year++) {
    byYear.push({ year, fi: 0, eu: 0 });
  }
  const yearIndex = new Map(byYear.map((row) => [row.year, row]));

  const domainCounts = new Map<string, number>();
  let withSummary = 0;
  let curated = 0;
  let excerpts = 0;
  let withInForce = 0;
  let amendments = 0;

  for (const ev of events as RegulationEvent[]) {
    const row = yearIndex.get(Number(ev.dateAnnounced.slice(0, 4)));
    if (row) {
      if (ev.jurisdiction === "FI") row.fi++;
      else row.eu++;
    }
    domainCounts.set(ev.domain, (domainCounts.get(ev.domain) ?? 0) + 1);
    if (hasSummary(ev)) withSummary++;
    if (ev.summarySource === "curated") curated++;
    if (ev.summarySource === "excerpt") excerpts++;
    if (ev.dateInForce) withInForce++;
    if (ev.amendedSections?.length) amendments++;
  }

  const byDomain = [...domainCounts.entries()]
    .map(([domain, n]) => ({
      label: DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] ?? domain,
      n,
    }))
    .sort((a, b) => b.n - a.n);

  // The three thinnest Finnish years, named in the limitations section: the
  // honest way to say "coverage is uneven" is to point at the years it failed.
  const thinnestYears = [...byYear]
    .filter((row) => row.year < toYear)
    .sort((a, b) => a.fi - b.fi)
    .slice(0, 3)
    .sort((a, b) => a.year - b.year);

  return {
    total: events.length,
    fi: dataset.counts.fi,
    eu: dataset.counts.eu,
    edges: dataset.edges.length,
    fromYear,
    toYear,
    generatedAt: dataset.generatedAt,
    sources: dataset.sourceVersion.split("+").map(describeSource),
    byDomain,
    byYear,
    withSummary,
    curated,
    excerpts,
    withInForce,
    amendments,
    thinnestYears,
  };
}

/**
 * One year-by-year bar strip. Single series per chart (Suomi and EU are drawn
 * as two charts sharing one y-scale) so the picture needs no legend and the
 * two are still comparable to each other.
 */
function yearBars(
  caption: string,
  rows: YearRow[],
  pick: (row: YearRow) => number,
  max: number,
): string {
  const own = Math.max(...rows.map(pick), 0);
  const w = 720;
  const h = 130;
  const padBottom = 22;
  const plot = h - padBottom;
  const step = w / rows.length;
  const barW = Math.max(3, step - 3); // 2-3px of surface between bars

  const bars = rows
    .map((row, i) => {
      const n = pick(row);
      const barH = max === 0 ? 0 : Math.round((n / max) * (plot - 4));
      const x = Math.round(i * step);
      const y = plot - barH;
      return (
        `<rect class="docs-bar" x="${x}" y="${y}" width="${barW.toFixed(1)}" ` +
        `height="${Math.max(barH, n > 0 ? 2 : 0)}" rx="2">` +
        `<title>${row.year}: ${numFmt.format(n)} säädöstä</title></rect>`
      );
    })
    .join("");

  const ticks = rows
    .filter((row) => row.year % 5 === 0)
    .map((row) => {
      const i = rows.findIndex((r) => r.year === row.year);
      const x = Math.round(i * step + barW / 2);
      return `<text class="docs-bar-tick" x="${x}" y="${h - 6}" text-anchor="middle">${row.year}</text>`;
    })
    .join("");

  return `
    <figure class="docs-figure">
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${caption}" preserveAspectRatio="none">
        <line class="docs-bar-axis" x1="0" y1="${plot}" x2="${w}" y2="${plot}" />
        ${bars}${ticks}
      </svg>
      <figcaption>${caption} · korkein vuosi ${numFmt.format(own)} säädöstä · sama pystyasteikko molemmissa kuvissa</figcaption>
    </figure>`;
}

function shot(name: string, alt: string, caption: string): string {
  const src = `${import.meta.env.BASE_URL}docs/${name}`;
  return `
    <figure class="docs-figure docs-shot">
      <img src="${src}" alt="${alt}" loading="lazy" />
      <figcaption>${caption}</figcaption>
    </figure>`;
}

const SECTIONS: { id: string; title: string }[] = [
  { id: "docs-mika", title: "Mikä tämä on" },
  { id: "docs-nakymat", title: "Neljä näkymää" },
  { id: "docs-ohjaimet", title: "Ohjaimet ja linkit" },
  { id: "docs-lahteet", title: "Mistä tiedot tulevat" },
  { id: "docs-kattavuus", title: "Kattavuus juuri nyt" },
  { id: "docs-paivitys", title: "Miten aineisto päivittyy" },
  { id: "docs-rajoitukset", title: "Rajoitukset" },
  { id: "docs-merkinnat", title: "Merkinnät ja sanasto" },
  { id: "docs-vastuu", title: "Vastuuvapaus ja lisenssit" },
];

function body(s: Stats): string {
  const maxYear = Math.max(
    ...s.byYear.map((r) => Math.max(r.fi, r.eu)),
    1,
  );
  const pct = (n: number) => Math.round((n / Math.max(s.total, 1)) * 100);
  const thin = s.thinnestYears
    .map((r) => `${r.year} (${r.fi === 0 ? "ei yhtään" : numFmt.format(r.fi)})`)
    .join(", ");
  const emptyYears = s.byYear.filter((r) => r.fi === 0).length;

  return `
<section id="docs-mika">
  <h2>Mikä tämä on</h2>
  <p>
    Regulaatiotutka näyttää, miten Suomen ja EU:n <strong>yritysten kannalta
    olennainen lainsäädäntö</strong> on muuttunut vuodesta ${s.fromYear}
    vuoteen ${s.toYear}. Se on selailtava kokonaiskuva, ei säädöskokoelma:
    tarkoitus on näyttää missä ja milloin sääntely on tiivistynyt, ja tarjota
    jokaisesta säädöksestä suora linkki viralliseen lähteeseen.
  </p>
  <p>
    Aineisto kootaan automaattisesti kolmesta avoimesta lähteestä ja
    täydennetään käsin koostetulla siemendatalla. Palvelu on staattinen sivu
    ilman taustapalvelinta: koko aineisto ladataan kerran yhtenä
    JSON-tiedostona, ja kaikki suodatus tapahtuu selaimessa.
  </p>
  <p class="docs-callout">
    Palvelu ei ole oikeudellinen neuvo eikä virallinen lähde. Vaikutusarvio on
    heuristiikka, ja aineistossa on tunnettuja aukkoja — ne on kuvattu
    kohdassa <a href="#docs-rajoitukset">Rajoitukset</a>.
  </p>
</section>

<section id="docs-nakymat">
  <h2>Neljä näkymää</h2>
  <p>
    Kaikki näkymät käyttävät samaa aineistoa ja samoja suodattimia. Näkymää
    vaihdetaan yläpalkin <em>Näkymä</em>-valitsimesta.
  </p>

  <h3>Tutka</h3>
  <p>
    Säädökset aikakehällä: <strong>kehän keskusta on ${s.fromYear} ja ulkoreuna
    tämä vuosi</strong>, joten mitä kauempana pisteet ovat keskustasta, sitä
    tuoreempia ne ovat. Sektori kertoo luokan (oikeudenala, Suomi/EU tai
    vaikutus — valitse <em>Sektorit</em>-valitsimesta), pisteen koko vaikutuksen
    ja väri sektorin. Aikajanan toisto “pyyhkäisee” tutkan läpi vuodesta
    ${s.fromYear} eteenpäin.
  </p>
  ${shot("tutka.jpg", "Tutkanäkymä: säädökset aikakehällä sektoreittain", "Tutka — sektorointi oikeudenaloittain, aikajana lopussa.")}

  <h3>Trendi</h3>
  <p>
    Sama aineisto vuosisummina: yksi viiva kutakin sektoria kohti, x-akselilla
    vuodet ja y-akselilla säädösten määrä. Näkymä vastaa kysymykseen “millä
    alueella sääntely on kasvanut”. Pystyviiva on aikajanan kohdistin.
  </p>
  ${shot("trendi.jpg", "Trendinäkymä: vuosittaiset säädösmäärät oikeudenaloittain", "Trendi — vuosisummat oikeudenaloittain.")}

  <h3>Graafi <span class="docs-tag">kokeellinen</span></h3>
  <p>
    Säädösten väliset suhteet: solmu on säädös, viiva suhde
    (muuttaa / kumoaa / perustuu). <strong>Suhdetiedot ovat EU-aineistosta</strong>
    — ne tulevat EUR-Lexin CELLAR-palvelusta. Suomen säädöksille ei ole
    vastaavaa koneluettavaa suhdetietoa, joten suomalaiset säädökset näkyvät
    graafissa ilman viivoja. Tässä koonnissa on
    ${numFmt.format(s.edges)} suhdetta.
  </p>
  ${shot("graafi.jpg", "Graafinäkymä: EU-säädösten suhdeverkosto", "Graafi — EU-säädösten suhteet; suomalaisilla säädöksillä ei ole viivoja.")}

  <h3>Lista</h3>
  <p>
    Kaikki säädökset uusimmasta vanhimpaan, kuukausiotsikoilla. Listalla on
    oma järjestysvalinta (<em>Annettu</em> / <em>Voimaan</em>) ja sen vieressä
    kahden kahvan <strong>ajanjaksovalitsin</strong>, joka rajaa sen mukaan
    kumpaa päivämäärää järjestys käyttää. Lista ei seuraa aikajanan
    kohdistinta — muut näkymät seuraavat.
  </p>
  ${shot("lista.jpg", "Listanäkymä: säädökset aikajärjestyksessä", "Lista — järjestys, ajanjaksovalitsin ja suodattimet.")}
</section>

<section id="docs-ohjaimet">
  <h2>Ohjaimet ja linkit</h2>
  <ul class="docs-list">
    <li><strong>Aikajana ja toisto.</strong> Alareunan aikajana asettaa
      kohdistimen: tutka, trendi ja graafi näyttävät sen hetken tilanteen.
      <em>Toista</em> ajaa kohdistinta eteenpäin, nopeus 0,1×–4×.</li>
    <li><strong>Sektorit.</strong> Vaihtaa luokittelun: oikeudenala,
      Suomi / EU tai vaikutus. Vaihto muuttaa sekä sektorit että värit.</li>
    <li><strong>Selite = suodatin.</strong> Selitteen riviä klikkaamalla
      rajaat näkymän siihen luokkaan; useampi valinta on sallittu.</li>
    <li><strong>Haku.</strong> Vapaa tekstihaku otsikoihin ja tunnisteisiin.
      Haku ja suodattimet vaikuttavat yhtä aikaa.</li>
    <li><strong>Jaettava linkki.</strong> Osoiterivin risuaidan jälkeinen osa
      kuvaa näkymän tilan (<code>#view=list&amp;jur=FI&amp;id=…</code>).
      Linkki on <strong>tilannekuva</strong>: kaikki mitä linkki ei mainitse,
      on oletusarvossaan, joten lähettäjä ja vastaanottaja näkevät saman
      näkymän. Toistotila ja nopeus jäävät laitekohtaisiksi.</li>
  </ul>
</section>

<section id="docs-lahteet">
  <h2>Mistä tiedot tulevat</h2>
  <ul class="docs-list">
    <li><strong>Finlex, konsolidoidut säädökset.</strong> Voimassa olevat
      Suomen säädökset ajantasaisina. Tämä joukko ei sisällä muutoslakeja —
      muutokset on jo sulautettu muutettuun säädökseen.</li>
    <li><strong>Finlex, säädöskokoelma.</strong> Säädökset sellaisina kuin ne
      on annettu, eli tässä näkyvät <em>“Laki X:n muuttamisesta”</em>
      -tyyppiset muutoslait. Ilman tätä lähdettä yksikään muutos ei näkyisi
      omana tapahtumanaan.</li>
    <li><strong>EUR-Lex / CELLAR.</strong> EU:n asetukset ja direktiivit sekä
      niiden väliset suhteet. Mukaan tulevat ne säädökset, joilla on jokin
      seurannassa olevista EuroVoc-aiheista.</li>
    <li><strong>Siemendata.</strong> ${numFmt.format(s.curated)} käsin
      koostettua keskeistä säädöstä omine suomenkielisine tiivistelmineen.
      Siemendata on aina mukana, se voittaa ristiriidassa koneellisen tiedon,
      eikä kokorajoitus koskaan pudota sitä pois.</li>
  </ul>

  <h3>Tiivistelmät</h3>
  <p>
    Palvelu <strong>ei koskaan kirjoita tiivistelmiä itse</strong>. Tekstiä on
    kolmea lajia, ja säädöskortti kertoo aina kummasta on kyse:
  </p>
  <ul class="docs-list">
    <li><strong>Käsin kirjoitettu tiivistelmä</strong> (${numFmt.format(s.curated)}
      säädöstä) — siemendatan suomenkielistä proosaa.</li>
    <li><strong>Ote säädöstekstistä</strong> (${numFmt.format(s.excerpts)}
      säädöstä) — sanatarkka lainaus säädöksen omasta ensimmäisestä pykälästä
      (yleensä <em>1 § Lain tarkoitus</em> tai <em>Soveltamisala</em>).</li>
    <li><strong>Ei tekstiä</strong> — EU-säädöksillä ei ole lähteessä
      tiivistelmää, eikä osassa suomalaisia asiakirjoja ole käyttökelpoista
      alkupykälää. Silloin kortti sanoo sen suoraan eikä toista otsikkoa.</li>
  </ul>
</section>

<section id="docs-kattavuus">
  <h2>Kattavuus juuri nyt</h2>
  <p>
    Nämä luvut on laskettu siitä aineistosta, joka on parhaillaan ladattuna.
  </p>
  <dl class="docs-stats">
    <div><dt>Säädöksiä</dt><dd>${numFmt.format(s.total)}</dd></div>
    <div><dt>Suomi</dt><dd>${numFmt.format(s.fi)}</dd></div>
    <div><dt>EU</dt><dd>${numFmt.format(s.eu)}</dd></div>
    <div><dt>Suhteita (graafi)</dt><dd>${numFmt.format(s.edges)}</dd></div>
    <div><dt>Tiivistelmä tai ote</dt><dd>${pct(s.withSummary)} %</dd></div>
    <div><dt>Voimaantulopäivä tiedossa</dt><dd>${pct(s.withInForce)} %</dd></div>
  </dl>

  ${yearBars(
    "Suomen säädökset vuosittain",
    s.byYear,
    (r) => r.fi,
    maxYear,
  )}
  ${yearBars("EU-säädökset vuosittain", s.byYear, (r) => r.eu, maxYear)}
  <p class="docs-note">
    Pylväiden epätasaisuus <em>ei</em> ole kuva lainsäädännön määrästä vaan
    kuva keruun onnistumisesta — ks. <a href="#docs-rajoitukset">Rajoitukset</a>.
  </p>

  <h3>Oikeudenaloittain</h3>
  <table class="docs-table">
    <thead><tr><th>Oikeudenala</th><th>Säädöksiä</th><th>Osuus</th></tr></thead>
    <tbody>
      ${s.byDomain
        .map(
          (d) =>
            `<tr><td>${d.label}</td><td>${numFmt.format(d.n)}</td><td>${pct(d.n)} %</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <dl class="docs-meta">
    <dt>Aineisto koottu</dt>
    <dd>${dateTimeFmt.format(new Date(s.generatedAt))}</dd>
    <dt>Lähteet tässä koonnissa</dt>
    <dd>${s.sources.join(" · ")}</dd>
    <dt>Kattavuusvuodet</dt>
    <dd>${s.fromYear}–${s.toYear}</dd>
  </dl>
</section>

<section id="docs-paivitys">
  <h2>Miten aineisto päivittyy</h2>
  <p>
    Aineisto ja sivusto päivittyvät erikseen. Koodimuutos julkaistaan ilman
    uutta keruuta, ja keruu ajetaan omana toimenaan — muuten tyylimuutos voisi
    julkaista vähemmän dataa kuin edellisellä kerralla.
  </p>
  <ul class="docs-list">
    <li><strong>Kuukausittainen automaattikeruu.</strong> Ajastettu ajo kerää
      lähteet uudelleen kerran kuussa.</li>
    <li><strong>Käsin julkaisu.</strong> Tämä osoite päivitetään käsin, kun
      keruu on ajettu — siksi julkaisupäivä ja aineiston koontipäivä ovat eri
      asioita, ja molemmat näkyvät: koontipäivä yllä, versio ja julkaisupäivä
      <em>Tietoja</em>-ikkunassa.</li>
    <li><strong>Aineisto kertyy.</strong> Jokainen ajo lukee edellisen
      julkaistun aineiston pohjaksi ja lisää siihen sen, mitä keruu tällä
      kertaa sai. Näin kerran haettu vuosi ei katoa, vaikka lähdepalvelu
      rajoittaisi seuraavaa ajoa — ja keruu voi keskittyä tuoreisiin vuosiin
      ja muutamaan vanhaan vuoteen kerrallaan.</li>
    <li><strong>Jos lähteet ovat poissa,</strong> palvelu näyttää edellisen
      aineiston, ja viime kädessä pelkän siemendatan — jolloin sivun yläreuna
      kertoo siitä.</li>
  </ul>
</section>

<section id="docs-rajoitukset">
  <h2>Rajoitukset</h2>
  <p>
    Nämä ovat tiedossa olevia puutteita. Ne kannattaa lukea ennen kuin
    näkymästä tekee johtopäätöksiä.
  </p>
  <ul class="docs-list">
    <li><strong>Vuosikattavuus on epätasainen.</strong> Finlexin avoin
      rajapinta rajoittaa kyselytahtia, ja keruulla on aikabudjetti, joten osa
      vuosista jää ohueksi. Tässä koonnissa Suomen aineisto on ohuin vuosina
      ${thin}${
        emptyYears > s.thinnestYears.length
          ? `, ja kokonaan ilman suomalaista säädöstä on ${emptyYears} vuotta`
          : ""
      }. Puuttuvat säädökset täydentyvät seuraavissa ajoissa; pylväiden
      korkeus kertoo keruusta, ei lainsäädännön määrästä.</li>
    <li><strong>Aiheluokittelu perustuu otsikon sanoihin.</strong> Suomalainen
      säädös päätyy mukaan vain, jos sen otsikko osuu johonkin kahdeksasta
      seurattavasta oikeudenalasta. Osuma tehdään sanavartaloilla, joten
      taivutusmuodot ja epätyypilliset otsikot voivat jäädä ulkopuolelle.
      Tämä on merkittävin syy siihen, että jokin tuntemasi laki puuttuu.</li>
    <li><strong>Muutoksista mukana ovat vain eduskunnan lait.</strong>
      Säädöskokoelmasta poimitaan otsikot muotoa <em>“Laki X:n
      muuttamisesta”</em> tai <em>“…kumoamisesta”</em>. Valtioneuvoston ja
      ministeriöiden asetusmuutokset jäisivät muuten hallitsemattoman
      suureksi joukoksi, joten ne eivät ole mukana muutostietona.</li>
    <li><strong>EU-puolella mukana ovat asetukset ja direktiivit.</strong>
      Päätökset, tiedonannot ja oikeuskäytäntö eivät ole mukana, eikä
      EU-säädös tule mukaan, jos sillä ei ole seurattavaa EuroVoc-aihetta.</li>
    <li><strong>Graafi kattaa vain EU:n.</strong> Säädösten väliset suhteet
      saadaan CELLARista. Suomen säädöksille ei ole vastaavaa koneluettavaa
      suhdetietoa saatavilla, joten graafi ei kerro, mikä suomalainen laki
      muuttaa mitäkin. Näkymä on siksi merkitty kokeelliseksi.</li>
    <li><strong>Vaikutusarvio on heuristiikka.</strong> “Merkittävä /
      kohtalainen / vähäinen” johdetaan säädöksen tyypistä ja laajuudesta,
      paitsi siemendatassa, jossa arvio on asetettu käsin. Se ei ole arvio
      vaikutuksesta juuri sinun yritykseesi.</li>
    <li><strong>Päivämäärät.</strong> <em>Annettu</em> on säädöksen
      antopäivä (EU:lla asiakirjan päivä, ei virallisen lehden päivä).
      <em>Voimaan</em> luetaan suomalaisen muutoslain omasta
      voimaantulolauseesta, joten avoimissa muotoiluissa se puuttuu: tässä
      koonnissa voimaantulopäivä on tiedossa ${pct(s.withInForce)} %:lla
      säädöksistä. Päivätön säädös ei mahdu mihinkään rajattuun ajanjaksoon.</li>
    <li><strong>Ei ajantasaisuustakuuta.</strong> Aineisto on korkeintaan yhtä
      tuore kuin sen koontipäivä, eikä palvelu kerro, onko säädös yhä
      voimassa. Tarkista aina virallinen lähde — jokaisessa kortissa on siihen
      suora linkki.</li>
  </ul>
</section>

<section id="docs-merkinnat">
  <h2>Merkinnät ja sanasto</h2>
  <ul class="docs-list">
    <li><strong>FI / EU</strong> — säädöksen antaja: Suomen lainsäätäjä tai
      Euroopan unioni.</li>
    <li><strong>Laki · Muutoslaki · Asetus</strong> — säädöksen laji.
      <em>Muutoslaki</em> muuttaa aiempaa lakia; kortti kertoo mitkä pykälät.</li>
    <li><strong>Säädösnumero</strong> (esim. <em>1390/2025</em>) on Suomen
      säädöskokoelman numero; EU:lla vastaava tunnus on CELEX.</li>
    <li><strong>Oikeudenala</strong> — kahdeksan seurattavaa aluetta:
      ${s.byDomain.map((d) => d.label).join(", ")}.</li>
    <li><strong>Vaikutus</strong> — heuristinen kolmiportainen arvio, joka
      ohjaa pisteen kokoa tutkassa.</li>
  </ul>
</section>

<section id="docs-vastuu">
  <h2>Vastuuvapaus ja lisenssit</h2>
  <p>
    Palvelu on tehty avoimesta datasta harrastusprojektina. Tietojen
    oikeellisuudesta ei anneta takeita, eikä palvelu ole oikeudellista
    neuvontaa. Virallinen tieto on aina Finlexissä ja EUR-Lexissä.
  </p>
  <ul class="docs-list">
    <li><strong>Finlex</strong> — avointa dataa; lähdeviittaus Finlex.</li>
    <li><strong>EUR-Lex / Euroopan unioni</strong> — metatiedot CC0, sisältö
      CC BY 4.0.</li>
    <li><strong>Lähdekoodi</strong> —
      <a href="${REPO_URL}" target="_blank" rel="noopener">${REPO_URL}</a></li>
  </ul>
</section>`;
}

function buildDocs(dataset: RegulationDataset): HTMLDivElement {
  const stats = collect(dataset);
  const overlay = document.createElement("div");
  overlay.className = "docs-overlay";
  overlay.innerHTML = `
    <div class="docs-shell" role="dialog" aria-modal="true" aria-label="Ohje ja dokumentaatio">
      <header class="docs-head">
        <div>
          <h1>Ohje ja dokumentaatio</h1>
          <p class="docs-sub">Regulaatiotutka · aineisto ${stats.fromYear}–${stats.toYear} · ${numFmt.format(stats.total)} säädöstä</p>
        </div>
        <button class="docs-close" type="button" aria-label="Sulje">Sulje ×</button>
      </header>
      <div class="docs-body">
        <nav class="docs-toc" aria-label="Sisällys">
          <ol>
            ${SECTIONS.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join("")}
          </ol>
        </nav>
        <article class="docs-article">${body(stats)}</article>
      </div>
    </div>`;

  const close = () => {
    overlay.remove();
    window.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  overlay.querySelector(".docs-close")!.addEventListener("click", close);
  window.addEventListener("keydown", onKey);

  // The table of contents scrolls the article, and must not touch the URL
  // fragment — that fragment is the app's shareable state.
  const article = overlay.querySelector<HTMLElement>(".docs-article")!;
  overlay.querySelectorAll<HTMLAnchorElement>(".docs-toc a, .docs-article a[href^='#']").forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href")!.slice(1);
      const target = article.querySelector(`#${id}`);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  return overlay;
}

/** Open the documentation full-screen. */
export function openDocs(dataset: RegulationDataset): void {
  document.body.appendChild(buildDocs(dataset));
}
