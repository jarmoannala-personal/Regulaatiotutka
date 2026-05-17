import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  zoom,
  type D3ZoomEvent,
  type ForceLink,
  type Selection,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3";
import type {
  RegulationEdge,
  RegulationEvent,
} from "../../shared/schema";
import type { AppState } from "../state/appState";
import { colorForEvent } from "../util/colors";
import { passesFiltersAndQuery } from "../util/match";

interface GNode extends SimulationNodeDatum {
  id: string;
  ev: RegulationEvent;
}
interface GLink extends SimulationLinkDatum<GNode> {
  type: RegulationEdge["type"];
}

const MAX_NODES = 450;
const R = { low: 4, medium: 6, high: 9 } as const;
const LINK_COLOR = {
  amends: "#7fb2e6",
  repeals: "#e15759",
  based_on: "#59a14f",
} as const;

type SVG = Selection<SVGSVGElement, unknown, null, undefined>;
type G = Selection<SVGGElement, unknown, null, undefined>;

/**
 * Experimental force-directed graph of EU legal relationships
 * (amends / repeals / based-on). Self-degrades to an empty note when the
 * relationship data is too sparse for the current filters/cursor.
 */
export class GraphComponent {
  private svg: SVG;
  private gRoot: G;
  private gLinks: G;
  private gNodes: G;
  private gLabels: G;
  private gEmpty: G;
  private tip: HTMLDivElement;
  private labelSel: Selection<
    SVGTextElement,
    GNode,
    SVGGElement,
    unknown
  > | null = null;
  private linkSel: Selection<
    SVGLineElement,
    GLink,
    SVGGElement,
    unknown
  > | null = null;
  private nodeSel: Selection<
    SVGCircleElement,
    GNode,
    SVGGElement,
    unknown
  > | null = null;
  private linkForce: ForceLink<GNode, GLink> | null = null;
  private nodeById = new Map<string, GNode>();
  private zoomK = 1;
  private labelBaseIds = new Set<string>();
  private labelRanked: GNode[] = [];
  private labelRaf = 0;
  private sim: Simulation<GNode, GLink> | null = null;
  private w = 0;
  private h = 0;
  private lastKey = "";
  private lastState: AppState | null = null;
  private lastEvents: RegulationEvent[] = [];
  private lastEdges: RegulationEdge[] = [];

  constructor(
    private container: HTMLElement,
    private onSelect: (e: RegulationEvent) => void,
  ) {
    this.svg = select(container).append("svg") as unknown as SVG;
    // gRoot is pan/zoom-transformed; gEmpty stays on the svg so the
    // "no data" note remains centred regardless of zoom.
    this.gRoot = this.svg.append("g");
    this.gLinks = this.gRoot.append("g").attr("stroke-opacity", 0.35);
    this.gNodes = this.gRoot.append("g");
    this.gLabels = this.gRoot.append("g");
    this.gEmpty = this.svg.append("g");
    this.tip = document.createElement("div");
    this.tip.className = "radar-tooltip";
    document.body.appendChild(this.tip);

    // Zoom: wheel / trackpad two-finger + pinch (ctrl+wheel) zoom; drag on
    // empty space pans. Node drag is left to d3.drag (filtered out here).
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 6])
      .filter((ev: Event) => {
        if (ev.type === "wheel") return true;
        const t = ev.target;
        return (
          !(ev as MouseEvent).button &&
          !(t instanceof Element && t.closest("circle"))
        );
      })
      .on("zoom", (ev: D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.gRoot.attr("transform", ev.transform.toString());
        this.zoomK = ev.transform.k;
        if (!this.labelRaf) {
          this.labelRaf = requestAnimationFrame(() => {
            this.labelRaf = 0;
            this.renderLabels();
          });
        }
      });
    this.svg.call(z).on("dblclick.zoom", null);
    this.svg.style("cursor", "grab");

    new ResizeObserver(() => this.resize()).observe(container);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w > 0 && h > 0 && (w !== this.w || h !== this.h)) {
      this.w = w;
      this.h = h;
      this.svg.attr("width", w).attr("height", h);
      this.lastKey = "";
      if (this.lastState) {
        this.update(this.lastState, this.lastEvents, this.lastEdges);
      }
    }
  }

  update(
    state: AppState,
    events: RegulationEvent[],
    edges: RegulationEdge[],
  ): void {
    this.lastState = state;
    this.lastEvents = events;
    this.lastEdges = edges;
    if (this.w === 0) this.resize();
    if (this.w === 0) return;

    const cursor = state.timelinePosition;
    const eligible = new Map<string, RegulationEvent>();
    for (const e of events) {
      if (
        new Date(`${e.dateAnnounced}T12:00:00Z`).getTime() <= cursor &&
        passesFiltersAndQuery(e, state)
      ) {
        eligible.set(e.id, e);
      }
    }
    const links0 = edges.filter(
      (g) => eligible.has(g.from) && eligible.has(g.to),
    );
    const degree = new Map<string, number>();
    for (const l of links0) {
      degree.set(l.from, (degree.get(l.from) ?? 0) + 1);
      degree.set(l.to, (degree.get(l.to) ?? 0) + 1);
    }
    let nodeIds = [...degree.keys()];
    if (nodeIds.length > MAX_NODES) {
      nodeIds = nodeIds
        .sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0))
        .slice(0, MAX_NODES);
    }
    const nodeSet = new Set(nodeIds);
    const links = links0.filter(
      (l) => nodeSet.has(l.from) && nodeSet.has(l.to),
    );

    const cursorYear = new Date(cursor).getUTCFullYear();
    const key = `${state.dimension}|${JSON.stringify(state.filters)}|${
      state.query
    }|${cursorYear}|${nodeIds.length}|${links.length}|${this.w}x${this.h}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.gEmpty.selectAll("*").remove();
    if (nodeIds.length === 0) {
      this.sim?.stop();
      this.gLinks.selectAll("*").remove();
      this.gNodes.selectAll("*").remove();
      this.gEmpty
        .append("text")
        .attr("class", "empty-note")
        .attr("x", this.w / 2)
        .attr("y", this.h / 2)
        .text(
          "Ei suhdetietoja näillä rajauksilla (kokeellinen näkymä)",
        );
      return;
    }

    // While auto-playing, keep node identity + positions so the graph
    // *grows in place* (no bounce); only brand-new nodes are added, seeded
    // next to a placed neighbour. Paused/explore mode uses fresh objects so
    // it gets the clean full spread.
    const reuse = state.playing && this.sim != null;
    const nbMap = new Map<string, string[]>();
    if (reuse) {
      for (const l of links) {
        (nbMap.get(l.from) ?? nbMap.set(l.from, []).get(l.from)!).push(l.to);
        (nbMap.get(l.to) ?? nbMap.set(l.to, []).get(l.to)!).push(l.from);
      }
    }
    const nodes: GNode[] = nodeIds.map((id) => {
      if (reuse) {
        const ex = this.nodeById.get(id);
        if (ex) {
          ex.ev = eligible.get(id)!;
          return ex;
        }
        const seed = (nbMap.get(id) ?? [])
          .map((x) => this.nodeById.get(x))
          .find((p) => p && p.x != null);
        return {
          id,
          ev: eligible.get(id)!,
          x: (seed?.x ?? this.w / 2) + (Math.random() - 0.5) * 24,
          y: (seed?.y ?? this.h / 2) + (Math.random() - 0.5) * 24,
        };
      }
      return { id, ev: eligible.get(id)! };
    });
    this.nodeById = new Map(nodes.map((n) => [n.id, n]));
    const gl: GLink[] = links.map((l) => ({
      source: l.from,
      target: l.to,
      type: l.type,
    }));

    const link = this.gLinks
      .selectAll<SVGLineElement, GLink>("line")
      .data(gl)
      .join("line")
      .attr("stroke", (d) => LINK_COLOR[d.type])
      .attr("stroke-width", 1);
    this.linkSel = link;

    const node = this.gNodes
      .selectAll<SVGCircleElement, GNode>("circle")
      .data(nodes, (d) => d.id)
      .join("circle")
      .attr("r", (d) => R[d.ev.impactTier])
      .attr("fill", (d) => colorForEvent(d.ev, state.dimension))
      .attr("stroke", "#0b1020")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .on("mouseenter", (e: MouseEvent, d) => {
        this.tip.innerHTML = `<strong>${d.ev.title}</strong><div class="meta">${d.ev.dateAnnounced} · ${d.ev.jurisdiction}</div>`;
        this.tip.classList.add("visible");
        this.tip.style.left = `${e.clientX + 14}px`;
        this.tip.style.top = `${e.clientY + 14}px`;
      })
      .on("mousemove", (e: MouseEvent) => {
        this.tip.style.left = `${e.clientX + 14}px`;
        this.tip.style.top = `${e.clientY + 14}px`;
      })
      .on("mouseleave", () => this.tip.classList.remove("visible"))
      .on("click", (_e, d) => this.onSelect(d.ev));
    this.nodeSel = node;

    // Label only a few "signal" nodes: hubs, the oldest, and one
    // representative per isolated island (not the giant component).
    const deg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const l of links) {
      deg.set(l.from, (deg.get(l.from) ?? 0) + 1);
      deg.set(l.to, (deg.get(l.to) ?? 0) + 1);
      (adj.get(l.from) ?? adj.set(l.from, []).get(l.from)!).push(l.to);
      (adj.get(l.to) ?? adj.set(l.to, []).get(l.to)!).push(l.from);
    }
    const comp = new Map<string, number>();
    let ci = 0;
    for (const n of nodes) {
      if (comp.has(n.id)) continue;
      const stack = [n.id];
      comp.set(n.id, ci);
      while (stack.length) {
        const cur = stack.pop()!;
        for (const nb of adj.get(cur) ?? []) {
          if (!comp.has(nb)) {
            comp.set(nb, ci);
            stack.push(nb);
          }
        }
      }
      ci++;
    }
    const compSize = new Map<number, number>();
    for (const c of comp.values())
      compSize.set(c, (compSize.get(c) ?? 0) + 1);
    const giant = [...compSize.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    const labelIds = new Set<string>();
    [...nodes]
      .sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))
      .slice(0, 14)
      .forEach((n) => labelIds.add(n.id));
    [...nodes]
      .sort((a, b) => a.ev.dateAnnounced.localeCompare(b.ev.dateAnnounced))
      .slice(0, 3)
      .forEach((n) => labelIds.add(n.id));
    const repByComp = new Map<number, GNode>();
    for (const n of nodes) {
      const c = comp.get(n.id)!;
      if (c === giant) continue;
      const cur = repByComp.get(c);
      if (!cur || (deg.get(n.id) ?? 0) > (deg.get(cur.id) ?? 0)) {
        repByComp.set(c, n);
      }
    }
    [...repByComp.entries()]
      .sort((a, b) => (compSize.get(b[0]) ?? 0) - (compSize.get(a[0]) ?? 0))
      .slice(0, 6)
      .forEach(([, n]) => labelIds.add(n.id));

    // Always-on base set; more central-node labels appear as you zoom in
    // (see renderLabels / the zoom handler).
    this.labelBaseIds = labelIds;
    this.labelRanked = [...nodes].sort(
      (a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0),
    );
    this.renderLabels();

    if (reuse && this.sim && this.linkForce) {
      // Grow in place: feed the new node/link set into the *existing*
      // simulation and give it a gentle nudge so newcomers settle without
      // throwing the whole layout around.
      this.sim.nodes(nodes);
      this.linkForce.links(gl);
      this.sim.alpha(0.12).restart();
    } else {
      this.sim?.stop();
      this.linkForce = forceLink<GNode, GLink>(gl)
        .id((d) => d.id)
        .distance(55)
        .strength(0.4);
      this.sim = forceSimulation<GNode, GLink>(nodes)
        .force("link", this.linkForce)
        .force("charge", forceManyBody<GNode>().strength(-70))
        .force("center", forceCenter(this.w / 2, this.h / 2))
        .force(
          "collide",
          forceCollide<GNode>((d) => R[d.ev.impactTier] + 3),
        )
        .on("tick", () => {
          this.linkSel
            ?.attr("x1", (d) => (d.source as GNode).x ?? 0)
            .attr("y1", (d) => (d.source as GNode).y ?? 0)
            .attr("x2", (d) => (d.target as GNode).x ?? 0)
            .attr("y2", (d) => (d.target as GNode).y ?? 0);
          this.nodeSel
            ?.attr("cx", (d) => d.x ?? 0)
            .attr("cy", (d) => d.y ?? 0);
          this.labelSel
            ?.attr("x", (d) => (d.x ?? 0) + R[d.ev.impactTier] + 4)
            .attr("y", (d) => (d.y ?? 0) + 3);
        });
    }

    node.call(
      drag<SVGCircleElement, GNode>()
        .on("start", (e, d) => {
          if (!e.active) this.sim?.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on("end", (e, d) => {
          if (!e.active) this.sim?.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );
  }

  /**
   * Render the node labels: the always-on base set (hubs / oldest / island
   * reps) plus more central nodes the further you've zoomed in. Text is
   * counter-scaled by the zoom so it stays readable instead of ballooning.
   */
  private renderLabels(): void {
    const extra = Math.max(
      0,
      Math.min(500, Math.round((this.zoomK - 1) * 90)),
    );
    const ids = new Set(this.labelBaseIds);
    for (let i = 0; i < this.labelRanked.length && i < 14 + extra; i++) {
      ids.add(this.labelRanked[i].id);
    }
    const data = this.labelRanked.filter((n) => ids.has(n.id));
    const fs = (10 / Math.max(1, this.zoomK)).toFixed(2);

    this.labelSel = this.gLabels
      .selectAll<SVGTextElement, GNode>("text")
      .data(data, (d) => d.id)
      .join("text")
      .attr("class", "graph-label")
      .style("font-size", `${fs}px`)
      .attr("x", (d) => (d.x ?? 0) + R[d.ev.impactTier] + 4)
      .attr("y", (d) => (d.y ?? 0) + 3)
      .text((d) => {
        const t = d.ev.title.replace(/\s+/g, " ").trim();
        return t.length > 34 ? `${t.slice(0, 33)}…` : t;
      });
  }
}
