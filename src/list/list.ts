import type {
  Domain,
  Jurisdiction,
  RegulationEvent,
} from "../../shared/schema";
import {
  DOMAINS,
  DOMAIN_LABELS,
  INSTRUMENT_LABELS,
  JURISDICTIONS,
  JURISDICTION_LABELS,
} from "../../shared/schema";
import type { AppState, ListSort } from "../state/appState";
import { colorForCategory, colorForEvent } from "../util/colors";
import { formatDate } from "../util/format";
import { passesFiltersAndQuery } from "../util/match";

/** Rows appended per chunk. Scrolling near the end appends the next chunk. */
const CHUNK = 200;
/** How far above the sentinel the next chunk is fetched, in px. */
const PREFETCH = 600;
/** Sentinel "year" for the trailing group of acts with no in-force date. */
const UNDATED_YEAR = -1;

const monthFmt = new Intl.DateTimeFormat("fi-FI", { month: "long" });
const dayFmt = new Intl.DateTimeFormat("fi-FI", {
  day: "numeric",
  month: "numeric",
});

function dateOf(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** The date the active sort orders, groups and shows. Null = unknown. */
function sortDate(e: RegulationEvent, sort: ListSort): string | null {
  return sort === "announced" ? e.dateAnnounced : e.dateInForce;
}

const SORTS: { id: ListSort; label: string; hint: string }[] = [
  { id: "announced", label: "Annettu", hint: "Järjestä antopäivän mukaan" },
  {
    id: "inForce",
    label: "Voimaan",
    hint: "Järjestä voimaantulon mukaan — tulevat ensin",
  },
];

/**
 * FI/EU badge colours. The background is the jurisdiction palette (the same
 * one the legend and radar use); only the readable foreground is local.
 */
const FLAG: Record<Jurisdiction, { fg: string }> = {
  FI: { fg: "#eaf2ff" },
  EU: { fg: "#241a00" },
};

/**
 * Reverse-chronological list of every regulation, with month dividers and
 * heavier year dividers, its own oikeudenala / Suomi–EU filter chips, and
 * incremental rendering (200 rows at a time, extended as you scroll — no
 * pagination).
 *
 * Unlike the radar, trend and dock feed this view deliberately ignores the
 * timeline cursor: it is the "browse everything" view, so `main.ts` hides the
 * timeline bar while it is active. Legend filters, the dimension switcher
 * (which colours the swatches) and the search box still apply, via the same
 * store, so the chips here and the dock legend stay in sync.
 */
export class ListComponent {
  private view: HTMLElement;
  private chips: HTMLElement;
  private head: HTMLElement;
  private scroll: HTMLElement;
  private body: HTMLElement;
  private sentinel: HTMLElement;

  private state: AppState | null = null;
  private items: RegulationEvent[] = [];
  private rendered = 0;
  private lastYear = -1;
  private lastMonth = -1;
  private rowById = new Map<string, HTMLElement>();
  private lastDataKey = "";
  private lastFilterKey = "";
  private lastDimension = "";
  private lastSelected: string | null = null;

  constructor(
    private container: HTMLElement,
    private onSelect: (e: RegulationEvent) => void,
    private onFilterChange: (filters: AppState["filters"]) => void,
    private onSortChange: (sort: ListSort) => void,
  ) {
    container.classList.add("list-host");
    this.view = document.createElement("div");
    this.view.className = "list-view";
    this.chips = document.createElement("div");
    this.chips.className = "list-filters";
    this.head = document.createElement("div");
    this.head.className = "list-count";
    this.scroll = document.createElement("div");
    this.scroll.className = "list-scroll";
    this.body = document.createElement("div");
    this.body.className = "list-body";
    this.sentinel = document.createElement("div");
    this.sentinel.className = "list-sentinel";
    this.scroll.append(this.body, this.sentinel);
    this.view.append(this.chips, this.head, this.scroll);
    container.appendChild(this.view);

    // Append the next chunk before the sentinel is actually reached, so the
    // list never shows a seam while scrolling fast.
    this.scroll.addEventListener(
      "scroll",
      () => {
        if (this.nearEnd()) this.renderMore();
      },
      { passive: true },
    );
  }

  update(state: AppState, events: RegulationEvent[]): void {
    this.state = state;

    const filterKey = JSON.stringify(state.filters);
    const chipKey = `${filterKey}|${state.listSort}`;
    if (chipKey !== this.lastFilterKey) {
      this.lastFilterKey = chipKey;
      this.renderChips(state);
    }

    const dataKey = `${filterKey}|${state.query}|${state.listSort}`;
    if (dataKey !== this.lastDataKey) {
      this.lastDataKey = dataKey;
      const matched = events.filter((e) => passesFiltersAndQuery(e, state));
      // Sorting by entry into force, ~7 % of Finnish amendments have no date
      // (open-ended commencement, "asetuksella säädettävänä ajankohtana").
      // They keep their place in the list, in a trailing group, rather than
      // being silently dropped.
      const dated = matched.filter((e) => sortDate(e, state.listSort) !== null);
      const undated = matched.filter(
        (e) => sortDate(e, state.listSort) === null,
      );
      dated.sort((a, b) =>
        sortDate(b, state.listSort)!.localeCompare(sortDate(a, state.listSort)!),
      );
      undated.sort((a, b) => b.dateAnnounced.localeCompare(a.dateAnnounced));
      this.items = [...dated, ...undated];
      this.rebuild();
    }

    // The dimension switcher only re-tints the swatches — no need to rebuild
    // (and lose the scroll position).
    if (state.dimension !== this.lastDimension) {
      this.lastDimension = state.dimension;
      const byId = new Map(this.items.map((e) => [e.id, e]));
      for (const [id, row] of this.rowById) {
        const e = byId.get(id);
        if (!e) continue;
        row.querySelector<HTMLElement>(".list-swatch")!.style.background =
          colorForEvent(e, state.dimension);
      }
    }

    if (state.selectedEventId !== this.lastSelected) {
      if (this.lastSelected) {
        this.rowById.get(this.lastSelected)?.classList.remove("selected");
      }
      if (state.selectedEventId) {
        this.rowById.get(state.selectedEventId)?.classList.add("selected");
      }
      this.lastSelected = state.selectedEventId;
    }
  }

  private rebuild(): void {
    this.body.innerHTML = "";
    this.rowById.clear();
    this.rendered = 0;
    this.lastYear = -1;
    this.lastMonth = -1;
    this.scroll.scrollTop = 0;
    const noun = this.items.length === 1 ? "säädös" : "säädöstä";
    const order =
      this.state?.listSort === "inForce"
        ? "voimaantulon mukaan, uusin ensin"
        : "antopäivän mukaan, uusin ensin";
    this.head.textContent = `${this.items.length} ${noun} · ${order}`;

    if (this.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "list-empty";
      empty.textContent =
        "Ei osumia — löysää suodattimia tai tyhjennä haku.";
      this.body.appendChild(empty);
      return;
    }
    this.renderMore();
  }

  private renderMore(): void {
    const state = this.state;
    if (!state || this.rendered >= this.items.length) return;

    const end = Math.min(this.items.length, this.rendered + CHUNK);
    const frag = document.createDocumentFragment();
    for (let i = this.rendered; i < end; i++) {
      const e = this.items[i];
      const iso = sortDate(e, state.listSort);
      // UNDATED_YEAR keeps the trailing "no date" group to one heading.
      const year = iso ? Number(iso.slice(0, 4)) : UNDATED_YEAR;
      const month = iso ? Number(iso.slice(5, 7)) : 0;
      if (year !== this.lastYear) {
        frag.appendChild(this.yearDivider(year));
        this.lastYear = year;
        this.lastMonth = -1;
      }
      if (month !== this.lastMonth) {
        frag.appendChild(this.monthDivider(iso));
        this.lastMonth = month;
      }
      const row = this.makeRow(e, state);
      this.rowById.set(e.id, row);
      frag.appendChild(row);
    }
    this.rendered = end;
    this.body.appendChild(frag);

    // One chunk may not reach past the fold on a tall window, and no scroll
    // follows a rebuild — top up until the sentinel is safely below.
    if (this.rendered < this.items.length && this.nearEnd()) {
      this.renderMore();
    }
  }

  /** True while the sentinel sits inside the pre-fetch band below the fold. */
  private nearEnd(): boolean {
    if (this.container.hidden) return false;
    const sentinel = this.sentinel.getBoundingClientRect();
    const box = this.scroll.getBoundingClientRect();
    return box.height > 0 && sentinel.top < box.bottom + PREFETCH;
  }

  private yearDivider(year: number): HTMLElement {
    const el = document.createElement("div");
    el.className = "list-year";
    if (year === UNDATED_YEAR) {
      el.classList.add("list-year-undated");
      el.textContent = "Voimaantulo avoin";
      el.title =
        "Lähde ei kerro voimaantulopäivää — Suomessa se säädetään usein " +
        "erikseen asetuksella";
    } else {
      el.textContent = String(year);
    }
    return el;
  }

  private monthDivider(iso: string | null): HTMLElement {
    const el = document.createElement("div");
    el.className = "list-month";
    // The undated group needs one too: sticky headers are only displaced by
    // the next sticky sibling, so without it the previous month stays pinned
    // over the whole group. It says why there is no date rather than filling
    // space.
    el.textContent = iso
      ? monthFmt.format(dateOf(iso))
      : "Ei voimaantulopäivää lähteessä";
    return el;
  }

  private makeRow(e: RegulationEvent, state: AppState): HTMLElement {
    const row = document.createElement("div");
    row.className = "list-row";
    if (e.id === state.selectedEventId) row.classList.add("selected");
    row.addEventListener("click", (ev) => {
      if ((ev.target as HTMLElement).closest("a")) return;
      this.onSelect(e);
    });

    const iso = sortDate(e, state.listSort);
    const date = document.createElement("span");
    date.className = "list-date";
    date.textContent = iso ? dayFmt.format(dateOf(iso)) : "–";
    date.title = iso
      ? state.listSort === "inForce"
        ? `Voimaan ${formatDate(iso)}`
        : `Annettu ${formatDate(iso)}`
      : "Voimaantulopäivää ei ole säädetty";

    // FI/EU is the one facet the domain-coloured dot cannot show, and the one
    // readers scan for. Letters, not a flag emoji: Windows renders no flag
    // glyphs, and the letters carry the jurisdiction colour anyway.
    const flag = document.createElement("span");
    flag.className = "list-flag";
    flag.textContent = e.jurisdiction;
    flag.title = JURISDICTION_LABELS[e.jurisdiction];
    flag.style.background = colorForCategory("jurisdiction", e.jurisdiction);
    flag.style.color = FLAG[e.jurisdiction].fg;

    const swatch = document.createElement("span");
    swatch.className = "list-swatch";
    swatch.style.background = colorForEvent(e, state.dimension);

    const main = document.createElement("span");
    main.className = "list-main";
    const title = document.createElement("span");
    title.className = "list-title";
    title.textContent = e.title;
    const sub = document.createElement("span");
    sub.className = "list-sub";
    sub.textContent = [
      DOMAIN_LABELS[e.domain],
      INSTRUMENT_LABELS[e.instrumentType],
      e.statuteNumber ?? e.celex,
    ]
      .filter(Boolean)
      .join(" · ");
    main.append(title, sub);

    const link = document.createElement("a");
    link.className = "list-link";
    link.href = e.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "↗";
    link.title = "Avaa virallinen lähde";

    row.append(date, flag, swatch, main, link);
    return row;
  }

  /** Chips for the two facets a list reader actually wants to narrow by. */
  private renderChips(state: AppState): void {
    this.chips.innerHTML = "";
    this.chips.append(
      this.sortGroup(state),
      this.chipGroup(
        "Suomi / EU",
        JURISDICTIONS,
        "jurisdictions",
        state,
        (v) => JURISDICTION_LABELS[v as Jurisdiction],
        (v) => colorForCategory("jurisdiction", v),
      ),
      this.chipGroup(
        "Oikeudenala",
        DOMAINS,
        "domains",
        state,
        (v) => DOMAIN_LABELS[v as Domain],
        (v) => colorForCategory("domain", v),
      ),
    );

    if (state.filters.domains.length || state.filters.jurisdictions.length) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "list-chip list-clear";
      clear.textContent = "Tyhjennä";
      clear.addEventListener("click", () =>
        this.onFilterChange({
          ...state.filters,
          domains: [],
          jurisdictions: [],
        }),
      );
      this.chips.appendChild(clear);
    }
  }

  /** Order-by control: which date the list sorts, groups and shows. */
  private sortGroup(state: AppState): HTMLElement {
    const group = document.createElement("div");
    group.className = "list-filter-group";
    const caption = document.createElement("span");
    caption.className = "list-filter-label";
    caption.textContent = "Järjestys";
    group.appendChild(caption);

    const seg = document.createElement("div");
    seg.className = "segmented list-sort";
    for (const sort of SORTS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = sort.label;
      btn.title = sort.hint;
      btn.classList.toggle("active", sort.id === state.listSort);
      btn.addEventListener("click", () => this.onSortChange(sort.id));
      seg.appendChild(btn);
    }
    group.appendChild(seg);
    return group;
  }

  private chipGroup(
    label: string,
    values: readonly string[],
    facet: "domains" | "jurisdictions",
    state: AppState,
    labelOf: (v: string) => string,
    colorOf: (v: string) => string,
  ): HTMLElement {
    const active = state.filters[facet] as readonly string[];
    const group = document.createElement("div");
    group.className = "list-filter-group";
    const caption = document.createElement("span");
    caption.className = "list-filter-label";
    caption.textContent = label;
    group.appendChild(caption);

    for (const value of values) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "list-chip";
      // Empty facet = show all, so nothing is dimmed until one is picked.
      if (active.includes(value)) chip.classList.add("on");
      else if (active.length) chip.classList.add("inactive");

      const sw = document.createElement("span");
      sw.className = "list-chip-swatch";
      sw.style.background = colorOf(value);
      chip.append(sw, document.createTextNode(labelOf(value)));

      chip.addEventListener("click", () => {
        const next = active.includes(value)
          ? active.filter((v) => v !== value)
          : [...active, value];
        this.onFilterChange(
          facet === "domains"
            ? { ...state.filters, domains: next as Domain[] }
            : { ...state.filters, jurisdictions: next as Jurisdiction[] },
        );
      });
      group.appendChild(chip);
    }
    return group;
  }
}
