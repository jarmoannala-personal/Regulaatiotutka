import type { RegulationEvent } from "../../shared/schema";
import {
  DOMAIN_LABELS,
  IMPACT_LABELS,
  INSTRUMENT_LABELS,
  JURISDICTION_LABELS,
} from "../../shared/schema";
import { formatDate, hasSummary } from "../util/format";

function row(term: string, value: string): string {
  return `<dt>${term}</dt><dd>${value}</dd>`;
}

/** Render (or hide) the detail panel for the selected event. */
export function renderDetailPanel(
  el: HTMLElement,
  event: RegulationEvent | null,
  onClose: () => void,
): void {
  if (!event) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <button class="close" aria-label="Sulje">×</button>
    <h2>${event.title}</h2>
    ${
      hasSummary(event)
        ? `<p>${event.summary}</p>`
        : '<p class="detail-nosummary">Tiivistelmää ei ole – ' +
          'säädöksen sisältö virallisessa lähteessä.</p>'
    }
    <dl>
      ${row("Lainkäyttö", JURISDICTION_LABELS[event.jurisdiction])}
      ${row("Oikeudenala", DOMAIN_LABELS[event.domain])}
      ${row("Tyyppi", INSTRUMENT_LABELS[event.instrumentType])}
      ${row("Vaikutus", IMPACT_LABELS[event.impactTier])}
      ${row("Annettu", formatDate(event.dateAnnounced))}
      ${row(
        "Voimaan",
        event.dateInForce ? formatDate(event.dateInForce) : "—",
      )}
      ${
        event.statuteNumber
          ? row("Säädösnumero", event.statuteNumber)
          : ""
      }
      ${event.celex ? row("CELEX", event.celex) : ""}
      ${
        event.amendedSections?.length
          ? row("Muutetut kohdat", event.amendedSections.join(", "))
          : ""
      }
    </dl>
    <p><a href="${event.sourceUrl}" target="_blank" rel="noopener">
      Avaa virallinen lähde →</a></p>
  `;
  el.querySelector<HTMLButtonElement>(".close")?.addEventListener(
    "click",
    onClose,
  );
}
