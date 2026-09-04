import type { RegulationDataset } from "../../shared/schema";
import { openDocs } from "./docs";

const REPO_URL = "https://github.com/jarmoannala-personal/Regulaatiotutka";

function buildOverlay(dataset: RegulationDataset): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "about-overlay";
  overlay.innerHTML = `
    <div class="about-card" role="dialog" aria-modal="true" aria-label="Tietoja">
      <button class="about-close" aria-label="Sulje">×</button>
      <h2>Regulaatiotutka</h2>
      <p class="about-tagline">
        Suomen ja EU:n yritysrelevantin lainsäädännön muutokset aikajanalla
        2000–2026. Neljä näkymää: <strong>Tutka</strong> (säädökset
        aikakehällä), <strong>Trendi</strong> (vuosittainen kehitys
        oikeudenaloittain), <strong>Graafi</strong> (säädösten väliset
        suhteet — kokeellinen) ja <strong>Lista</strong> (kaikki säädökset
        uusimmasta vanhimpaan). Vaihda sektorointi, suodata selitteestä, hae
        tekstillä.
      </p>
      <dl class="about-meta">
        <dt>Versio</dt>
        <dd>v${__APP_VERSION__} · build ${__GIT_SHA__} · ${__BUILD_DATE__}</dd>
        <dt>Omistaja</dt>
        <dd>Jarmo Annala &lt;<a href="mailto:jarmo.annala@idle.fi">jarmo.annala@idle.fi</a>&gt;</dd>
        <dt>Lähdekoodi</dt>
        <dd><a href="${REPO_URL}" target="_blank" rel="noopener">${REPO_URL}</a></dd>
      </dl>
      <h3>Tietolähteet</h3>
      <ul class="about-sources">
        <li><strong>EUR-Lex / CELLAR</strong> — EU-asetukset ja -direktiivit
          (EuroVoc-luokittelu) sekä säädösten suhteet (muuttaa / kumoaa /
          perustuu). Metatiedot CC0, sisältö CC BY 4.0.</li>
        <li><strong>Finlex avoin data</strong> — Suomen konsolidoidut säädökset
          (Akoma Ntoso). Avoin data, lähdeviittaus Finlex.</li>
        <li><strong>Siemendata</strong> — käsin koostetut keskeiset säädökset,
          offline-varalla.</li>
      </ul>
      <button class="about-docs" type="button">
        Ohje ja dokumentaatio — näkymät, tietolähteet ja rajoitukset →
      </button>
      <p class="about-foot">
        Ei takeita tietojen oikeellisuudesta. Vaikutusarvio on heuristinen.
        Tarkista aina virallinen lähde.
      </p>
    </div>`;

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay
    .querySelector(".about-close")!
    .addEventListener("click", close);
  // The documentation takes over the screen, so the small card gets out of
  // its way rather than stacking behind it.
  overlay.querySelector(".about-docs")!.addEventListener("click", () => {
    close();
    openDocs(dataset);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      window.removeEventListener("keydown", onKey);
    }
  };
  window.addEventListener("keydown", onKey);
  return overlay;
}

/** Adds a "Tietoja" button to `container` that opens the About overlay. */
export function setupAbout(
  container: HTMLElement,
  dataset: RegulationDataset,
): void {
  const btn = document.createElement("button");
  btn.className = "about-btn";
  btn.type = "button";
  btn.title = "Tietoja palvelusta";
  btn.textContent = "Tietoja";
  btn.addEventListener("click", () =>
    document.body.appendChild(buildOverlay(dataset)),
  );
  container.appendChild(btn);
}
