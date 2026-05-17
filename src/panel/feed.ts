import type { RegulationEvent } from "../../shared/schema";
import type { AppState } from "../state/appState";
import { colorForEvent } from "../util/colors";
import { yearOf } from "../util/format";
import { passesFiltersAndQuery } from "../util/match";

/** Keep the DOM light; the newest slice is what "follows" the timeline. */
const MAX_ROWS = 150;

let prevIds = new Set<string>();

/**
 * Render the timeline-following feed: every event that has "appeared" by the
 * cursor, newest first, so new rows push in at the top as the timeline plays
 * or is scrubbed. Respects the legend filters. Clicking a row opens the
 * detail panel; the ↗ link goes straight to the official source.
 */
export function renderFeed(
  el: HTMLElement,
  events: RegulationEvent[],
  state: AppState,
  onSelect: (e: RegulationEvent) => void,
): void {
  const cursor = state.timelinePosition;
  const visible = events
    .filter(
      (e) =>
        new Date(`${e.dateAnnounced}T12:00:00Z`).getTime() <= cursor &&
        passesFiltersAndQuery(e, state),
    )
    .sort((a, b) => b.dateAnnounced.localeCompare(a.dateAnnounced));

  const shown = visible.slice(0, MAX_ROWS);
  const nextIds = new Set(shown.map((e) => e.id));

  el.className = "feed-panel";
  el.innerHTML = "";

  const head = document.createElement("div");
  head.className = "feed-head";
  head.textContent = `Lainsäädäntö · ${visible.length}`;
  el.appendChild(head);

  const list = document.createElement("div");
  list.className = "feed-list";
  el.appendChild(list);

  if (shown.length === 0) {
    const empty = document.createElement("div");
    empty.className = "feed-empty";
    empty.textContent = "Ei vielä muutoksia — toista aikajanaa.";
    list.appendChild(empty);
  }

  for (const e of shown) {
    const row = document.createElement("div");
    row.className = "feed-item";
    if (!prevIds.has(e.id) && prevIds.size > 0) {
      row.classList.add("just-added");
    }
    row.addEventListener("click", (ev) => {
      if ((ev.target as HTMLElement).closest("a")) return;
      onSelect(e);
    });

    const swatch = document.createElement("span");
    swatch.className = "feed-swatch";
    swatch.style.background = colorForEvent(e, state.dimension);

    const body = document.createElement("span");
    body.className = "feed-body";
    const title = document.createElement("span");
    title.className = "feed-title";
    title.textContent = e.title;
    title.title = e.title;
    const meta = document.createElement("span");
    meta.className = "feed-meta";
    meta.textContent = `${yearOf(e.dateAnnounced)} · ${e.jurisdiction}`;
    body.append(title, meta);

    const link = document.createElement("a");
    link.className = "feed-link";
    link.href = e.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "↗";
    link.title = "Avaa virallinen lähde";

    row.append(swatch, body, link);
    list.appendChild(row);
  }

  prevIds = nextIds;
}
