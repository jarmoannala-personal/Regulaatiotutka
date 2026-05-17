import type { RegulationEvent } from "../../shared/schema";
import type { AppState } from "../state/appState";
import { colorForEvent } from "../util/colors";
import { yearOf } from "../util/format";
import { passesFiltersAndQuery } from "../util/match";

/** Keep the DOM light; the most recent slice is what "follows" the timeline. */
const MAX_ROWS = 150;

const rows = new Map<string, HTMLElement>();
let lastSig = "";
let lastDimension = "";

function makeRow(
  e: RegulationEvent,
  dim: AppState["dimension"],
  onSelect: (e: RegulationEvent) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "feed-item";
  row.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("a")) return;
    onSelect(e);
  });

  const swatch = document.createElement("span");
  swatch.className = "feed-swatch";
  swatch.style.background = colorForEvent(e, dim);

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
  return row;
}

/**
 * Timeline-following feed. Chronological (oldest at top, newest at the
 * bottom). Updates are incremental — existing rows are kept, only genuinely
 * new ones are appended (sliding in) and trimmed-off ones removed — so the
 * scroll position is preserved and the view eases down by ~one row instead of
 * lurching. The sweep fires ~60×/s, so a content signature short-circuits
 * frames where nothing changed.
 */
export function renderFeed(
  el: HTMLElement,
  events: RegulationEvent[],
  state: AppState,
  onSelect: (e: RegulationEvent) => void,
): void {
  const cursor = state.timelinePosition;
  const matched = events
    .filter(
      (e) =>
        new Date(`${e.dateAnnounced}T12:00:00Z`).getTime() <= cursor &&
        passesFiltersAndQuery(e, state),
    )
    .sort((a, b) => a.dateAnnounced.localeCompare(b.dateAnnounced));

  const total = matched.length;
  const shown = matched.slice(Math.max(0, total - MAX_ROWS));
  const sig = shown.map((e) => e.id).join(",");
  if (
    sig === lastSig &&
    state.dimension === lastDimension &&
    el.dataset.built === "1"
  ) {
    return; // nothing visible changed this frame
  }

  // One-time scaffold.
  if (el.dataset.built !== "1") {
    el.className = "feed-panel";
    el.innerHTML =
      '<div class="feed-head"></div><div class="feed-list"></div>';
    el.dataset.built = "1";
    rows.clear();
  }
  const head = el.querySelector<HTMLElement>(".feed-head")!;
  const list = el.querySelector<HTMLElement>(".feed-list")!;
  head.textContent = `Lainsäädäntö · ${total}`;

  const wasAtBottom =
    list.scrollHeight - list.scrollTop - list.clientHeight < 32;
  const desired = new Set(shown.map((e) => e.id));
  const firstBuild = rows.size === 0;

  // Remove rows that fell out of the window / filters.
  for (const [id, node] of rows) {
    if (!desired.has(id)) {
      node.remove();
      rows.delete(id);
    }
  }

  // Re-colour swatches if the category dimension changed.
  const dimChanged = state.dimension !== lastDimension;

  let appended = 0;
  let lastNode: HTMLElement | null = null;
  for (const e of shown) {
    let node = rows.get(e.id);
    if (!node) {
      node = makeRow(e, state.dimension, onSelect);
      if (!firstBuild) {
        node.classList.add("feed-enter");
        appended++;
      }
      rows.set(e.id, node);
      // Ascending order: surviving rows keep their order, new ones go after
      // the last placed node (≈ at the end).
      if (lastNode) lastNode.after(node);
      else list.appendChild(node);
    } else if (dimChanged) {
      node.querySelector<HTMLElement>(".feed-swatch")!.style.background =
        colorForEvent(e, state.dimension);
    }
    lastNode = node;
  }

  if (shown.length === 0) {
    if (!list.querySelector(".feed-empty")) {
      list.innerHTML =
        '<div class="feed-empty">Ei vielä muutoksia — toista aikajanaa.</div>';
    }
  } else {
    list.querySelector(".feed-empty")?.remove();
  }

  // Gentle follow: only nudge when already at the bottom and something was
  // actually appended (don't yank a user who scrolled up to read).
  if ((firstBuild || appended > 0) && wasAtBottom) {
    list.scrollTo({
      top: list.scrollHeight,
      behavior: state.playing && !firstBuild ? "smooth" : "auto",
    });
  }

  lastSig = sig;
  lastDimension = state.dimension;
}
