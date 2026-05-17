import {
  axisBottom,
  axisLeft,
  line,
  pointer,
  scaleLinear,
  select,
  type Selection,
} from "d3";
import type { RegulationEvent } from "../../shared/schema";
import type { AppState } from "../state/appState";
import { categoriesFor } from "../state/appState";
import { categoryValue, colorForCategory } from "../util/colors";
import { shortCategoryLabel, yearOf } from "../util/format";
import { passesFiltersAndQuery } from "../util/match";

type SVG = Selection<SVGSVGElement, unknown, null, undefined>;
type G = Selection<SVGGElement, unknown, null, undefined>;

const M = { top: 26, right: 120, bottom: 34, left: 44 };

/**
 * Area-trend chart: per-category yearly volume of legislative change. Lines
 * grow with the timeline cursor (one point per year), so playing the timeline
 * animates each domain's development. Honours the dimension switcher, legend
 * filters and search — the same as the radar.
 */
export class TrendComponent {
  private svg: SVG;
  private gx: G;
  private gy: G;
  private gLines: G;
  private gMarker: G;
  private gLabels: G;
  private tip: HTMLDivElement;
  private w = 0;
  private h = 0;
  private fromYear: number;
  private toYear: number;
  private lastKey = "";
  private lastState: AppState | null = null;
  private lastEvents: RegulationEvent[] = [];

  constructor(
    private container: HTMLElement,
    timeDomain: [Date, Date],
  ) {
    this.fromYear = timeDomain[0].getUTCFullYear();
    this.toYear = timeDomain[1].getUTCFullYear();
    this.svg = select(container).append("svg") as unknown as SVG;
    this.gLines = this.svg.append("g");
    this.gx = this.svg.append("g").attr("class", "trend-axis");
    this.gy = this.svg.append("g").attr("class", "trend-axis");
    this.gMarker = this.svg.append("g");
    this.gLabels = this.svg.append("g");
    this.tip = document.createElement("div");
    this.tip.className = "radar-tooltip";
    document.body.appendChild(this.tip);
    this.svg.on("mouseleave", () => this.tip.classList.remove("visible"));
    new ResizeObserver(() => this.resize()).observe(container);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w > 0 && h > 0 && (w !== this.w || h !== this.h)) {
      this.w = w;
      this.h = h;
      this.svg.attr("width", w).attr("height", h);
      this.lastKey = ""; // force redraw at new size
      if (this.lastState) this.update(this.lastState, this.lastEvents);
    }
  }

  update(state: AppState, events: RegulationEvent[]): void {
    this.lastState = state;
    this.lastEvents = events;
    if (this.w === 0) this.resize();
    if (this.w === 0) return;

    const cats = categoriesFor(state.dimension).filter((c) =>
      events.some(
        (e) =>
          categoryValue(e, state.dimension) === c &&
          passesFiltersAndQuery(e, state),
      ),
    );

    const cursorYear = new Date(state.timelinePosition).getUTCFullYear();
    const key = `${state.dimension}|${JSON.stringify(state.filters)}|${
      state.query
    }|${cursorYear}|${this.w}x${this.h}`;

    const x = scaleLinear()
      .domain([this.fromYear, this.toYear])
      .range([M.left, this.w - M.right]);

    // Cheap path: only the cursor marker moves within a year.
    const cursorFrac =
      this.fromYear +
      (state.timelinePosition - Date.UTC(this.fromYear, 0, 1)) /
        (Date.UTC(this.toYear + 1, 0, 1) - Date.UTC(this.fromYear, 0, 1)) *
        (this.toYear - this.fromYear + 1);
    this.gMarker.selectAll("line").data([0]).join("line")
      .attr("class", "trend-cursor")
      .attr("x1", x(cursorFrac))
      .attr("x2", x(cursorFrac))
      .attr("y1", M.top)
      .attr("y2", this.h - M.bottom);

    if (key === this.lastKey) return;
    this.lastKey = key;

    const years = this.toYear - this.fromYear + 1;
    // counts[cat] = number[year], using all events passing filters/query
    // (full extent fixes the y-axis); shownMax limits lines to the cursor.
    const counts = new Map<string, number[]>();
    for (const c of cats) counts.set(c, new Array(years).fill(0));
    let maxY = 1;
    for (const e of events) {
      if (!passesFiltersAndQuery(e, state)) continue;
      const c = categoryValue(e, state.dimension);
      const arr = counts.get(c);
      if (!arr) continue;
      const yi = yearOf(e.dateAnnounced) - this.fromYear;
      if (yi >= 0 && yi < years) {
        arr[yi]++;
        if (arr[yi] > maxY) maxY = arr[yi];
      }
    }

    const y = scaleLinear()
      .domain([0, maxY])
      .nice()
      .range([this.h - M.bottom, M.top]);

    this.gx
      .attr("transform", `translate(0,${this.h - M.bottom})`)
      .call(
        axisBottom(x)
          .tickValues(
            Array.from(
              { length: Math.ceil(years / 5) },
              (_, i) => this.fromYear + i * 5,
            ),
          )
          .tickFormat((d) => String(d)),
      );
    this.gy
      .attr("transform", `translate(${M.left},0)`)
      .call(axisLeft(y).ticks(5).tickFormat((d) => String(d)));

    const lineGen = line<{ yr: number; v: number }>()
      .x((d) => x(d.yr))
      .y((d) => y(d.v));

    const lastPlotYear = Math.min(this.toYear, cursorYear);
    const series = cats.map((c) => {
      const arr = counts.get(c)!;
      const pts: { yr: number; v: number }[] = [];
      for (let yr = this.fromYear; yr <= lastPlotYear; yr++) {
        pts.push({ yr, v: arr[yr - this.fromYear] });
      }
      return { cat: c, pts, total: arr.reduce((a, b) => a + b, 0) };
    });

    this.gLines
      .selectAll<SVGPathElement, (typeof series)[number]>("path")
      .data(series, (d) => d.cat)
      .join("path")
      .attr("class", "trend-line")
      .attr("fill", "none")
      .attr("stroke", (d) => colorForCategory(state.dimension, d.cat))
      .attr("stroke-width", 2)
      .transition()
      .duration(250)
      .attr("d", (d) => lineGen(d.pts) ?? "");

    // End-of-line labels (so the chart reads without the legend).
    this.gLabels
      .selectAll<SVGTextElement, (typeof series)[number]>("text")
      .data(
        series.filter((s) => s.pts.length > 0),
        (d) => d.cat,
      )
      .join("text")
      .attr("class", "trend-label")
      .attr("fill", (d) => colorForCategory(state.dimension, d.cat))
      .attr("x", (d) => x(d.pts[d.pts.length - 1].yr) + 8)
      .attr("y", (d) => y(d.pts[d.pts.length - 1].v))
      .attr("dominant-baseline", "middle")
      .text((d) => shortCategoryLabel(state.dimension, d.cat));

    // Hover guide.
    this.svg
      .selectAll<SVGRectElement, unknown>("rect.trend-hit")
      .data([0])
      .join("rect")
      .attr("class", "trend-hit")
      .attr("x", M.left)
      .attr("y", M.top)
      .attr("width", Math.max(0, this.w - M.right - M.left))
      .attr("height", Math.max(0, this.h - M.bottom - M.top))
      .attr("fill", "transparent")
      .on("mousemove", (ev: MouseEvent) => {
        const [px] = pointer(ev, this.svg.node());
        const yr = Math.round(x.invert(px));
        if (yr < this.fromYear || yr > lastPlotYear) return;
        const rowsHtml = series
          .filter((s) => s.total > 0)
          .map((s) => {
            const v = s.pts.find((p) => p.yr === yr)?.v ?? 0;
            const col = colorForCategory(state.dimension, s.cat);
            return `<div class="meta"><span class="legend-swatch" style="background:${col}"></span>${shortCategoryLabel(
              state.dimension,
              s.cat,
            )}: ${v}</div>`;
          })
          .join("");
        this.tip.innerHTML = `<strong>${yr}</strong>${rowsHtml}`;
        this.tip.style.left = `${ev.clientX + 14}px`;
        this.tip.style.top = `${ev.clientY + 14}px`;
        this.tip.classList.add("visible");
      });
  }
}
