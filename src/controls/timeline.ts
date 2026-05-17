import { drag, pointer, range, scaleTime, select, type Selection } from "d3";
import type { AppState, PlaySpeed } from "../state/appState";

const SPEEDS: PlaySpeed[] = [0.5, 1, 2, 4];
const H = 46;
const PAD = 18;

export interface TimelineCallbacks {
  onScrub(epochMs: number): void;
  onTogglePlay(): void;
  onSpeed(speed: PlaySpeed): void;
}

/** The bottom timeline bar: big year readout + transport + full-width scrubber. */
export class TimelineControl {
  private yearEl: HTMLDivElement;
  private playBtn: HTMLButtonElement;
  private speedWrap: HTMLDivElement;
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private gTicks: Selection<SVGGElement, unknown, null, undefined>;
  private bg: Selection<SVGLineElement, unknown, null, undefined>;
  private fill: Selection<SVGLineElement, unknown, null, undefined>;
  private thumb: Selection<SVGCircleElement, unknown, null, undefined>;
  private width = 0;
  private x = scaleTime();
  private lastYear = NaN;

  constructor(
    container: HTMLElement,
    private timeDomain: [Date, Date],
    cb: TimelineCallbacks,
  ) {
    this.yearEl = document.createElement("div");
    this.yearEl.className = "year-readout";

    const transport = document.createElement("div");
    transport.className = "transport";
    this.playBtn = document.createElement("button");
    this.playBtn.className = "play";
    this.playBtn.addEventListener("click", () => cb.onTogglePlay());
    this.speedWrap = document.createElement("div");
    this.speedWrap.className = "speed";
    for (const s of SPEEDS) {
      const b = document.createElement("button");
      b.textContent = `${s}×`;
      b.dataset.speed = String(s);
      b.addEventListener("click", () => cb.onSpeed(s));
      this.speedWrap.appendChild(b);
    }
    transport.append(this.playBtn, this.speedWrap);

    const scrubWrap = document.createElement("div");
    scrubWrap.className = "scrubber";
    this.svg = select(scrubWrap)
      .append("svg")
      .attr("height", H) as unknown as Selection<
      SVGSVGElement,
      unknown,
      null,
      undefined
    >;
    const trackY = 16;
    this.bg = this.svg
      .append("line")
      .attr("class", "track-bg")
      .attr("y1", trackY)
      .attr("y2", trackY) as unknown as Selection<
      SVGLineElement,
      unknown,
      null,
      undefined
    >;
    this.fill = this.svg
      .append("line")
      .attr("class", "track-fill")
      .attr("y1", trackY)
      .attr("y2", trackY) as unknown as Selection<
      SVGLineElement,
      unknown,
      null,
      undefined
    >;
    this.gTicks = this.svg.append("g");
    this.svg
      .append("rect")
      .attr("class", "hit")
      .attr("y", 0)
      .attr("height", trackY + 10)
      .on("click", (e: MouseEvent) => {
        const [px] = pointer(e, this.svg.node());
        cb.onScrub(this.clamp(this.x.invert(px).getTime()));
      });
    this.thumb = this.svg
      .append("circle")
      .attr("class", "thumb")
      .attr("cy", trackY)
      .attr("r", 8) as unknown as Selection<
      SVGCircleElement,
      unknown,
      null,
      undefined
    >;
    this.thumb.call(
      drag<SVGCircleElement, unknown>().on("drag", (e) => {
        cb.onScrub(this.clamp(this.x.invert(e.x).getTime()));
      }),
    );

    container.append(this.yearEl, transport, scrubWrap);
    new ResizeObserver(() => this.resize()).observe(scrubWrap);
  }

  private clamp(ms: number): number {
    const [lo, hi] = this.timeDomain;
    return Math.max(lo.getTime(), Math.min(hi.getTime(), ms));
  }

  private resize(): void {
    const w = (this.svg.node()?.parentElement?.clientWidth ?? 0) | 0;
    if (w <= 0 || w === this.width) return;
    this.width = w;
    this.svg.attr("width", w);
    this.x = scaleTime()
      .domain(this.timeDomain)
      .range([PAD, w - PAD]);
    this.bg.attr("x1", PAD).attr("x2", w - PAD);

    const y0 = this.timeDomain[0].getUTCFullYear();
    const y1 = this.timeDomain[1].getUTCFullYear();
    const step = w < 620 ? 10 : 5;
    const years = range(Math.ceil(y0 / step) * step, y1 + 1, step);
    const t = this.gTicks
      .selectAll<SVGGElement, number>("g.tick")
      .data(years)
      .join((enter) => {
        const g = enter.append("g").attr("class", "tick");
        g.append("line").attr("y1", 24).attr("y2", 29);
        g.append("text").attr("y", 41);
        return g;
      });
    t.attr("transform", (yr) => `translate(${this.x(new Date(Date.UTC(yr, 0, 1)))},0)`);
    t.select("text").text((yr) => String(yr));
  }

  update(state: AppState): void {
    if (this.width === 0) this.resize();
    const year = new Date(state.timelinePosition).getUTCFullYear();
    if (year !== this.lastYear) {
      this.lastYear = year;
      this.yearEl.textContent = String(year);
      this.yearEl.classList.add("tick");
      window.setTimeout(() => this.yearEl.classList.remove("tick"), 180);
    }

    this.playBtn.textContent = state.playing ? "⏸  Pysäytä" : "▶  Toista";
    this.playBtn.classList.toggle("active", state.playing);
    for (const b of Array.from(this.speedWrap.children) as HTMLElement[]) {
      b.classList.toggle("active", b.dataset.speed === String(state.speed));
    }

    const px = this.x(new Date(state.timelinePosition));
    this.thumb.attr("cx", px);
    this.fill.attr("x1", PAD).attr("x2", px);
  }
}
