import "./style.css";
import type { RegulationEvent } from "../shared/schema";
import { renderCategorySwitcher } from "./controls/categorySwitcher";
import { enableDockResize } from "./controls/dockResize";
import { setupDockToggle } from "./controls/dockToggle";
import { renderLegend } from "./controls/legend";
import { setupSearch } from "./controls/search";
import { TimelineControl } from "./controls/timeline";
import { loadDataset } from "./data/loadDataset";
import { setupAbout } from "./panel/about";
import { renderDetailPanel } from "./panel/detailPanel";
import { renderFeed } from "./panel/feed";
import { renderViewSwitcher } from "./controls/viewSwitcher";
import { GraphComponent } from "./graph/graph";
import { ListComponent } from "./list/list";
import { RadarComponent } from "./radar/radar";
import { SweepDriver } from "./radar/sweep";
import { TrendComponent } from "./trend/trend";
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
  const edges = dataset.edges;

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

  const radarHost = document.getElementById("radar-host")!;
  const trendHost = document.getElementById("trend-host")!;
  const graphHost = document.getElementById("graph-host")!;
  const listHost = document.getElementById("list-host")!;
  const switcherEl = document.getElementById("switcher")!;
  const viewSwitchEl = document.getElementById("viewswitch")!;
  const legendEl = document.getElementById("legend")!;
  const feedEl = document.getElementById("feed")!;
  const panelEl = document.getElementById("detail-panel")!;
  const timelineEl = document.getElementById("timeline")!;

  const topbarControls =
    document.querySelector<HTMLElement>(".topbar-controls")!;
  setupDockToggle(topbarControls);
  setupAbout(topbarControls);
  enableDockResize(document.getElementById("rightdock")!);
  setupSearch(document.getElementById("search")!, (q) =>
    store.set({ query: q }),
  );

  // Keep the stage clear of the (variable-height) top bar and timeline bar.
  const topbarEl = document.querySelector<HTMLElement>(".topbar")!;
  const timelineBarEl = document.getElementById("timeline")!;
  const syncLayoutVars = () => {
    const root = document.documentElement.style;
    root.setProperty("--topbar-h", `${topbarEl.offsetHeight + 12}px`);
    root.setProperty("--timeline-h", `${timelineBarEl.offsetHeight + 8}px`);
  };
  new ResizeObserver(syncLayoutVars).observe(topbarEl);
  new ResizeObserver(syncLayoutVars).observe(timelineBarEl);
  syncLayoutVars();

  const radar = new RadarComponent(
    radarHost,
    timeDomain,
    (e: RegulationEvent) => store.set({ selectedEventId: e.id }),
  );
  const trend = new TrendComponent(trendHost, timeDomain);
  const graph = new GraphComponent(graphHost, (e: RegulationEvent) =>
    store.set({ selectedEventId: e.id }),
  );
  const list = new ListComponent(
    listHost,
    (e: RegulationEvent) => store.set({ selectedEventId: e.id }),
    (filters) => store.set({ filters }),
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
    // The list view is not cursor-gated, so the timeline keys do nothing.
    if (s.view === "list") return;
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
  let lastView = "";
  store.subscribe((s) => {
    if (s.view !== lastView) {
      lastView = s.view;
      radarHost.hidden = s.view !== "radar";
      trendHost.hidden = s.view !== "trend";
      graphHost.hidden = s.view !== "graph";
      listHost.hidden = s.view !== "list";
      // The list shows every match regardless of the cursor, so the timeline
      // bar has nothing to say there — hide it and give the list its height.
      // The dock feed is the cursor-following slice of the same data, so it
      // would only be a confusing near-duplicate next to the list.
      timelineEl.hidden = s.view === "list";
      feedEl.hidden = s.view === "list";
      document.body.classList.toggle("view-list", s.view === "list");
      syncLayoutVars();
      renderViewSwitcher(viewSwitchEl, s.view, (view) =>
        store.set(view === "list" ? { view, playing: false } : { view }),
      );
    }
    if (s.view === "radar") radar.update(s, events);
    else if (s.view === "trend") trend.update(s, events);
    else if (s.view === "graph") graph.update(s, events, edges);
    else list.update(s, events);
    timeline.update(s);
    if (s.dimension !== lastDimension) {
      lastDimension = s.dimension;
      renderCategorySwitcher(switcherEl, s.dimension, (dim) =>
        store.set({ dimension: dim }),
      );
    }
    renderLegend(legendEl, s, (filters) => store.set({ filters }));
    if (s.view !== "list") {
      renderFeed(feedEl, events, s, (e) =>
        store.set({ selectedEventId: e.id }),
      );
    }
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
