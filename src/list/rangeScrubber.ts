import { drag, pointer, range as d3range, scaleLinear, select, type Selection } from "d3";
import type { ListRange, ListSort } from "../state/appState";

const H = 34;
const PAD = 10;
const TRACK_Y = 11;
const THUMB_R = 6;

type Sel<T extends Element> = Selection<T, unknown, null, undefined>;

/**
 * Two-thumb month-range scrubber for the list toolbar — the list's own
 * "when" control, since the timeline bar is hidden there. The thumbs select
 * whole months inclusively: the left one sits at the start of its month, the
 * right one at the end of its month, so a range covering a single month still
 * has a visible width. A thumb at either extreme means "unbounded" (`null`),
 * so the resting position filters nothing and the URL stays empty.
 *
 * The track spans whole years, given by {@link setDomain} from the data, so
 * the in-force dates that run ahead of the coverage years (EU regulations
 * applying from 2027) are still reachable.
 */
export class RangeScrubber {
  readonly el: HTMLElement;
  private caption: HTMLElement;
  private readout: HTMLElement;
  private clearBtn: HTMLButtonElement;
  private svg: Sel<SVGSVGElement>;
  private bg: Sel<SVGLineElement>;
  private fill: Sel<SVGLineElement>;
  private gTicks: Sel<SVGGElement>;
  private lo: Sel<SVGCircleElement>;
  private hi: Sel<SVGCircleElement>;
  private width = 0;
  /** Month index → px. Domain is [0, months]; thumb positions are integers. */
  private x = scaleLinear();
  private fromYear = 2000;
  private months = 12;
  /** Current thumb positions as month indices: lo ∈ [0, hi], hi ∈ [lo, months-1]. */
  private loIdx = 0;
  private hiIdx = 11;
  private value: ListRange = { from: null, to: null };

  constructor(
    container: HTMLElement,
    private onChange: (range: ListRange) => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "list-toolbar-group range-group";

    this.caption = document.createElement("span");
    this.caption.className = "list-toolbar-label";
    this.caption.textContent = "Ajanjakso";

    const scrub = document.createElement("div");
    scrub.className = "range-scrubber";
    this.svg = select(scrub).append("svg").attr("height", H) as unknown as Sel<SVGSVGElement>;
    this.bg = this.svg
      .append("line")
      .attr("class", "track-bg")
      .attr("y1", TRACK_Y)
      .attr("y2", TRACK_Y) as unknown as Sel<SVGLineElement>;
    this.fill = this.svg
      .append("line")
      .attr("class", "track-fill")
      .attr("y1", TRACK_Y)
      .attr("y2", TRACK_Y) as unknown as Sel<SVGLineElement>;
    this.gTicks = this.svg.append("g") as unknown as Sel<SVGGElement>;
    // Clicking the track moves whichever thumb is nearer.
    this.svg
      .append("rect")
      .attr("class", "hit")
      .attr("y", 0)
      .attr("height", TRACK_Y + THUMB_R + 4)
      .on("click", (e: MouseEvent) => {
        const [px] = pointer(e, this.svg.node());
        const f = this.x.invert(px);
        const dLo = Math.abs(f - this.loIdx);
        const dHi = Math.abs(f - (this.hiIdx + 1));
        if (dLo <= dHi) this.setLo(Math.round(f));
        else this.setHi(Math.round(f) - 1);
      });
    this.lo = this.thumb("Alkaen", (f) => this.setLo(Math.round(f)));
    this.hi = this.thumb("Asti", (f) => this.setHi(Math.round(f) - 1));

    this.readout = document.createElement("span");
    this.readout.className = "range-readout";

    this.clearBtn = document.createElement("button");
    this.clearBtn.type = "button";
    this.clearBtn.className = "range-clear";
    this.clearBtn.textContent = "×";
    this.clearBtn.title = "Näytä kaikki ajanjaksot";
    this.clearBtn.addEventListener("click", () =>
      this.onChange({ from: null, to: null }),
    );

    this.el.append(this.caption, scrub, this.readout, this.clearBtn);
    container.appendChild(this.el);
    new ResizeObserver(() => this.resize()).observe(scrub);
  }

  private thumb(
    label: string,
    onDrag: (fractionalIdx: number) => void,
  ): Sel<SVGCircleElement> {
    const c = this.svg
      .append("circle")
      .attr("class", "thumb")
      .attr("cy", TRACK_Y)
      .attr("r", THUMB_R)
      .attr("tabindex", 0)
      .attr("role", "slider")
      .attr("aria-label", label) as unknown as Sel<SVGCircleElement>;
    c.call(
      drag<SVGCircleElement, unknown>().on("drag", (e) =>
        onDrag(this.x.invert(e.x)),
      ),
    );
    // Arrow = one month, Shift+arrow = one year, Home/End = the extremes.
    c.on("keydown", (e: KeyboardEvent) => {
      const isLo = label === "Alkaen";
      const cur = isLo ? this.loIdx : this.hiIdx;
      const step = e.shiftKey ? 12 : 1;
      let next: number | null = null;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
      else if (e.key === "Home") next = isLo ? 0 : this.loIdx;
      else if (e.key === "End") next = isLo ? this.hiIdx : this.months - 1;
      if (next === null) return;
      e.preventDefault();
      if (isLo) this.setLo(next);
      else this.setHi(next);
    });
    return c;
  }

  /** Whole years the track spans, inclusive. Call before the first update. */
  setDomain(fromYear: number, toYear: number): void {
    this.fromYear = fromYear;
    this.months = (toYear - fromYear + 1) * 12;
    this.x.domain([0, this.months]);
    this.width = 0; // force a re-layout of ticks
    this.resize();
  }

  /** Reflect the store's value: thumbs, fill, readout and the sort-aware hint. */
  update(range: ListRange, sort: ListSort): void {
    this.value = range;
    this.loIdx = range.from === null ? 0 : this.clampIdx(this.toIdx(range.from));
    this.hiIdx =
      range.to === null ? this.months - 1 : this.clampIdx(this.toIdx(range.to));
    if (this.loIdx > this.hiIdx) this.loIdx = this.hiIdx;

    const what = sort === "inForce" ? "voimaantulon" : "antopäivän";
    this.caption.title = `Rajaa ${what} mukaan — vedä päitä tai klikkaa janaa`;

    const active = range.from !== null || range.to !== null;
    this.el.classList.toggle("active", active);
    this.clearBtn.hidden = !active;
    this.readout.textContent = active
      ? range.from && range.to
        ? `${fmt(range.from)} – ${fmt(range.to)}`
        : range.from
          ? `${fmt(range.from)} alkaen`
          : `${fmt(range.to!)} asti`
      : "Kaikki";
    this.lo.attr("aria-valuetext", range.from ? fmt(range.from) : "alusta");
    this.hi.attr("aria-valuetext", range.to ? fmt(range.to) : "loppuun");

    if (this.width === 0) this.resize();
    this.position();
  }

  private position(): void {
    const x0 = this.x(this.loIdx);
    const x1 = this.x(this.hiIdx + 1);
    this.lo.attr("cx", x0);
    this.hi.attr("cx", x1);
    this.fill.attr("x1", x0).attr("x2", x1);
  }

  private setLo(idx: number): void {
    const next = Math.max(0, Math.min(this.hiIdx, idx));
    this.emit(next === 0 ? null : this.toYm(next), this.value.to);
  }

  private setHi(idx: number): void {
    const next = Math.max(this.loIdx, Math.min(this.months - 1, idx));
    this.emit(this.value.from, next === this.months - 1 ? null : this.toYm(next));
  }

  private emit(from: string | null, to: string | null): void {
    if (from === this.value.from && to === this.value.to) return;
    this.onChange({ from, to });
  }

  private clampIdx(i: number): number {
    return Math.max(0, Math.min(this.months - 1, i));
  }

  private toIdx(ym: string): number {
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    return (y - this.fromYear) * 12 + (m - 1);
  }

  private toYm(idx: number): string {
    const y = this.fromYear + Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  private resize(): void {
    const w = (this.svg.node()?.parentElement?.clientWidth ?? 0) | 0;
    if (w <= 0 || w === this.width) return;
    this.width = w;
    this.svg.attr("width", w);
    this.x.range([PAD, w - PAD]);
    this.bg.attr("x1", PAD).attr("x2", w - PAD);

    const years = this.months / 12;
    const y0 = this.fromYear;
    const y1 = y0 + years - 1;
    // Roughly one label per 60 px, on round years.
    const step = w / years >= 60 ? 1 : w / years >= 30 ? 2 : w / years >= 12 ? 5 : 10;
    const labelled = d3range(Math.ceil(y0 / step) * step, y1 + 1, step);
    const t = this.gTicks
      .selectAll<SVGGElement, number>("g.tick")
      .data(labelled)
      .join((enter) => {
        const g = enter.append("g").attr("class", "tick");
        g.append("line").attr("y1", TRACK_Y + 7).attr("y2", TRACK_Y + 11);
        g.append("text").attr("y", TRACK_Y + 21);
        return g;
      });
    t.attr("transform", (yr) => `translate(${this.x((yr - y0) * 12)},0)`);
    t.select("text").text((yr) => String(yr));
    this.position();
  }
}

/** `2015-06` → `6/2015`, the way Finns write a month. */
function fmt(ym: string): string {
  return `${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;
}
