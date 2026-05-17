import { range, select, type Selection } from "d3";
import type { RegulationEvent } from "../../shared/schema";
import type { AppState } from "../state/appState";
import { shortCategoryLabel } from "../util/format";
import { colorForCategory } from "../util/colors";
import { passesFiltersAndQuery } from "../util/match";
import { flashBlips, renderBlips } from "./blips";
import { createGeometry, type RadarGeometry } from "./geometry";

type SVG = Selection<SVGSVGElement, unknown, null, undefined>;
type G = Selection<SVGGElement, unknown, null, undefined>;

function annularWedge(
  cx: number,
  cy: number,
  ri: number,
  ro: number,
  a0: number,
  a1: number,
): string {
  const pt = (r: number, a: number) =>
    `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return (
    `M ${pt(ri, a0)} L ${pt(ro, a0)} ` +
    `A ${ro} ${ro} 0 ${large} 1 ${pt(ro, a1)} ` +
    `L ${pt(ri, a1)} A ${ri} ${ri} 0 ${large} 0 ${pt(ri, a0)} Z`
  );
}

export class RadarComponent {
  private svg!: SVG;
  private layers!: Record<string, G>;
  private geom!: RadarGeometry;
  private size = 0;
  private lastDimension: AppState["dimension"] | null = null;
  private prevTime = -Infinity;
  private lastState: AppState | null = null;
  private lastEvents: RegulationEvent[] = [];

  constructor(
    private container: HTMLElement,
    private timeDomain: [Date, Date],
    private onSelect: (e: RegulationEvent) => void,
  ) {
    this.svg = select(container).append("svg") as unknown as SVG;
    this.layers = {
      sectors: this.svg.append("g"),
      rings: this.svg.append("g"),
      ringLabels: this.svg.append("g"),
      sweep: this.svg.append("g"),
      blips: this.svg.append("g"),
      sectorLabels: this.svg.append("g"),
      empty: this.svg.append("g"),
    };
    new ResizeObserver(() => this.resize()).observe(container);
  }

  private resize(): void {
    const s = Math.min(
      this.container.clientWidth,
      this.container.clientHeight,
    );
    if (s > 0 && s !== this.size) {
      this.size = s;
      this.svg.attr("width", s).attr("height", s).attr("viewBox", `0 0 ${s} ${s}`);
      this.lastDimension = null; // force geometry + static redraw
      // Re-render now that we have real dimensions (layout may settle after
      // the first paint).
      if (this.lastState) this.update(this.lastState, this.lastEvents);
    }
  }

  /** Draw time rings + category sector wedges (only when geometry changes). */
  private drawStatic(state: AppState): void {
    this.geom = createGeometry(
      this.size,
      this.size,
      state.dimension,
      this.timeDomain,
    );
    const g = this.geom;

    // Year rings every 5 years.
    const y0 = this.timeDomain[0].getUTCFullYear();
    const y1 = this.timeDomain[1].getUTCFullYear();
    const years = range(Math.ceil(y0 / 5) * 5, y1 + 1, 5);
    this.layers.rings
      .selectAll("circle")
      .data(years)
      .join("circle")
      .attr("class", "ring-circle")
      .attr("cx", g.cx)
      .attr("cy", g.cy)
      .attr("r", (yr) => g.timeToRadius(Date.UTC(yr, 0, 1)));
    this.layers.ringLabels
      .selectAll("text")
      .data(years)
      .join("text")
      .attr("class", "ring-label")
      .attr("x", g.cx + 3)
      .attr("y", (yr) => g.cy - g.timeToRadius(Date.UTC(yr, 0, 1)) - 2)
      .text((yr) => String(yr));

    this.layers.sectors
      .selectAll<SVGPathElement, string>("path")
      .data(g.categories as string[])
      .join("path")
      .attr("class", "sector-wedge")
      .attr("data-cat", (c) => c)
      .attr("d", (c) => {
        const s = g.sectorFor(c);
        return annularWedge(g.cx, g.cy, g.rInner, g.rOuter, s.start, s.end);
      });

    const labelR = g.rOuter + this.size * 0.035;
    this.layers.sectorLabels
      .selectAll<SVGTextElement, string>("text")
      .data(g.categories as string[])
      .join("text")
      .attr("class", "sector-label")
      // Anchor toward the centre by quadrant so labels never clip the edge.
      .attr("text-anchor", (c) => {
        const cos = Math.cos(g.sectorFor(c).center);
        return cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
      })
      .attr("dominant-baseline", (c) => {
        const sin = Math.sin(g.sectorFor(c).center);
        return sin > 0.5 ? "hanging" : sin < -0.5 ? "auto" : "middle";
      })
      .attr("fill", (c) => colorForCategory(state.dimension, c))
      .attr("x", (c) => g.cx + labelR * Math.cos(g.sectorFor(c).center))
      .attr("y", (c) => g.cy + labelR * Math.sin(g.sectorFor(c).center))
      .text((c) => shortCategoryLabel(state.dimension, c));

    this.lastDimension = state.dimension;
  }

  update(state: AppState, events: RegulationEvent[]): void {
    this.lastState = state;
    this.lastEvents = events;
    if (this.size === 0) this.resize();
    if (this.size === 0) return;

    if (this.lastDimension !== state.dimension) {
      this.drawStatic(state);
      this.prevTime = -Infinity;
    }
    const g = this.geom;

    // Sweep wavefront: a glowing ring at the current-time radius over a
    // faint "revealed" disc.
    const r = g.timeToRadius(state.timelinePosition);
    const sweep = this.layers.sweep;
    sweep.selectAll("*").remove();
    sweep
      .append("circle")
      .attr("class", "sweep-disc")
      .attr("cx", g.cx)
      .attr("cy", g.cy)
      .attr("r", r);
    sweep
      .append("circle")
      .attr("class", "sweep-ring")
      .attr("cx", g.cx)
      .attr("cy", g.cy)
      .attr("r", r);

    // Only blips that have "happened" by the cursor are shown; they pop in
    // as the cursor advances (see renderBlips).
    const cursor = state.timelinePosition;
    const visible = events.filter(
      (e) => new Date(`${e.dateAnnounced}T12:00:00Z`).getTime() <= cursor,
    );
    renderBlips(this.layers.blips, visible, g, state, {
      onSelect: this.onSelect,
    });

    // Flash sectors + blips for events entering (prevTime, currentTime].
    const entered = new Set<string>();
    const enteredCats = new Set<string>();
    for (const e of events) {
      const t = new Date(`${e.dateAnnounced}T12:00:00Z`).getTime();
      if (t > this.prevTime && t <= state.timelinePosition) {
        entered.add(e.id);
        enteredCats.add(
          state.dimension === "domain"
            ? e.domain
            : state.dimension === "jurisdiction"
              ? e.jurisdiction
              : e.impactTier,
        );
      }
    }
    if (this.prevTime !== -Infinity) {
      flashBlips(this.layers.blips, entered);
      this.layers.sectors
        .selectAll<SVGPathElement, string>("path")
        .classed("flash", (c) => enteredCats.has(c));
      window.setTimeout(
        () =>
          this.layers.sectors
            .selectAll("path")
            .classed("flash", false),
        600,
      );
    }
    this.prevTime = state.timelinePosition;

    // Empty state when nothing is visible under cursor + filters + search.
    const f = state.filters;
    const anyVisible = events.some(
      (e) =>
        new Date(`${e.dateAnnounced}T12:00:00Z`).getTime() <=
          state.timelinePosition && passesFiltersAndQuery(e, state),
    );
    this.layers.empty.selectAll("*").remove();
    if (!anyVisible) {
      const narrowed =
        f.domains.length ||
        f.jurisdictions.length ||
        f.impact.length ||
        state.query.trim().length > 0;
      const anyEverByNow = events.some(
        (e) =>
          new Date(`${e.dateAnnounced}T12:00:00Z`).getTime() <=
          state.timelinePosition,
      );
      this.layers.empty
        .append("text")
        .attr("class", "empty-note")
        .attr("x", g.cx)
        .attr("y", g.cy)
        .text(
          narrowed && anyEverByNow
            ? "Ei osumia — väljennä suodattimia tai hakua"
            : "▶  Toista tai raahaa aikajanaa nähdäksesi muutokset",
        );
    }
  }
}
