import "./style.css";
import type { RegulationEvent } from "../shared/schema";
import { renderCategorySwitcher } from "./controls/categorySwitcher";
import { enableDockResize } from "./controls/dockResize";
import { renderLegend } from "./controls/legend";
import { setupSearch } from "./controls/search";
import { TimelineControl } from "./controls/timeline";
import { loadDataset } from "./data/loadDataset";
import { setupAbout } from "./panel/about";
import { renderDetailPanel } from "./panel/detailPanel";
import { renderFeed } from "./panel/feed";
import { RadarComponent } from "./radar/radar";
import { SweepDriver } from "./radar/sweep";
import { createStore, defaultState } from "./state/appState";
import { loadPersisted, savePersisted } from "./state/persistence";

function fatal(msg: string): void {
  const c = document.getElementById("stage");
  if (c) {
    c.innerHTML = `<p style="color:#e15759;max-width:32ch;text-align:center">${msg}</p>`;
  }
}

async function boot(): Promise<void> {
  let dataset;
  try {
    dataset = await loadDataset();
  } catch (err) {
    fatal(
      `Datan lataus epäonnistui: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return;
  }
  const events = dataset.events;

  const banner = document.getElementById("data-banner");
  if (banner && dataset.origin === "seed-fallback") {
    banner.hidden = false;
    banner.textContent =
      "Näytetään siemendataa (offline-koonti) — ei reaaliaikainen.";
  }

  const timeDomain: [Date, Date] = [
    new Date(Date.UTC(dataset.coverage.fromYear, 0, 1)),
    new Date(Date.UTC(dataset.coverage.toYear, 11, 31)),
  ];

  const defaults = defaultState(dataset.coverage);
  const store = createStore(loadPersisted(defaults));

  const stageEl = document.getElementById("stage")!;
  const switcherEl = document.getElementById("switcher")!;
  const legendEl = document.getElementById("legend")!;
  const feedEl = document.getElementById("feed")!;
  const panelEl = document.getElementById("detail-panel")!;
  const timelineEl = document.getElementById("timeline")!;

  setupAbout(document.querySelector<HTMLElement>(".topbar-controls")!);
  enableDockResize(document.getElementById("rightdock")!);
  setupSearch(document.getElementById("search")!, (q) =>
    store.set({ query: q }),
  );

  const radar = new RadarComponent(
    stageEl,
    timeDomain,
    (e: RegulationEvent) => store.set({ selectedEventId: e.id }),
  );

  const timeline = new TimelineControl(timelineEl, timeDomain, {
    onScrub: (ms) =>
      store.set({ timelinePosition: ms, playing: false, mode: "manual" }),
    onTogglePlay: () => {
      const s = store.get();
      const atEnd = s.timelinePosition >= timeDomain[1].getTime() - 1000;
      store.set({
        playing: !s.playing,
        mode: "auto",
        timelinePosition: atEnd
          ? timeDomain[0].getTime()
          : s.timelinePosition,
      });
    },
    onSpeed: (speed) => store.set({ speed }),
  });

  const sweep = new SweepDriver(
    timeDomain[1].getTime(),
    (ms) => store.set({ timelinePosition: ms }),
    () => store.set({ playing: false }),
  );

  // Keyboard: space = play/pause, ←/→ = step ±1 year.
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const s = store.get();
    if (e.code === "Space") {
      e.preventDefault();
      const atEnd = s.timelinePosition >= timeDomain[1].getTime() - 1000;
      store.set({
        playing: !s.playing,
        mode: "auto",
        timelinePosition: atEnd ? timeDomain[0].getTime() : s.timelinePosition,
      });
    } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      const dir = e.code === "ArrowRight" ? 1 : -1;
      const d = new Date(s.timelinePosition);
      d.setUTCFullYear(d.getUTCFullYear() + dir);
      const ms = Math.max(
        timeDomain[0].getTime(),
        Math.min(timeDomain[1].getTime(), d.getTime()),
      );
      store.set({ timelinePosition: ms, playing: false, mode: "manual" });
    }
  });

  let lastDimension = "";
  store.subscribe((s) => {
    radar.update(s, events);
    timeline.update(s);
    if (s.dimension !== lastDimension) {
      lastDimension = s.dimension;
      renderCategorySwitcher(switcherEl, s.dimension, (dim) =>
        store.set({ dimension: dim }),
      );
    }
    renderLegend(legendEl, s, (filters) => store.set({ filters }));
    renderFeed(feedEl, events, s, (e) =>
      store.set({ selectedEventId: e.id }),
    );
    renderDetailPanel(
      panelEl,
      events.find((e) => e.id === s.selectedEventId) ?? null,
      () => store.set({ selectedEventId: null }),
    );
    sweep.sync(s);
    savePersisted(s);
  });

  renderCategorySwitcher(switcherEl, store.get().dimension, (dim) =>
    store.set({ dimension: dim }),
  );
  // Kick a first render once layout has measured (ResizeObserver also fires).
  requestAnimationFrame(() => store.set({}));
}

void boot();
