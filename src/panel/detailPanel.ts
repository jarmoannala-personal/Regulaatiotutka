import type { RegulationEvent } from "../../shared/schema";
import {
  DOMAIN_LABELS,
  IMPACT_LABELS,
  INSTRUMENT_LABELS,
  JURISDICTION_LABELS,
} from "../../shared/schema";
import { escapeHtml, formatDate, hasSummary } from "../util/format";

function row(term: string, value: string): string {
  return `<dt>${term}</dt><dd>${value}</dd>`;
}

/**
 * The text under the heading, and where it came from.
 *
 * Three honest states: curated prose from the seed, a verbatim quote of the
 * act's own opening provision (labelled as a quote, with the § it quotes), or
 * nothing — which is said outright rather than papered over with the title.
 */
function summaryBlock(event: RegulationEvent): string {
  if (!hasSummary(event)) {
    return (
      '<p class="detail-nosummary">Tiivistelmää ei ole – ' +
      "säädöksen sisältö virallisessa lähteessä.</p>"
    );
  }
  if (event.summarySource !== "excerpt") {
    return `<p>${escapeHtml(event.summary)}</p>`;
  }
  const ref = event.summaryRef
    ? `Ote säädöstekstistä, ${escapeHtml(event.summaryRef)}`
    : "Ote säädöstekstistä";
  return (
    `<blockquote class="detail-excerpt">${escapeHtml(event.summary)}` +
    `</blockquote><p class="detail-excerpt-src">${ref}</p>`
  );
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
    <h2>${escapeHtml(event.title)}</h2>
    ${summaryBlock(event)}
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
