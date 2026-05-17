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
  private gEmpty: G;
  private tip: HTMLDivElement;
  private sim: Simulation<GNode, GLink> | null = null;
  private linkForce: ForceLink<GNode, GLink> | null = null;
  private nodeById = new Map<string, GNode>();
  private linkSel: Selection<SVGLineElement, GLink, SVGGElement, unknown> | null =
    null;
  private nodeSel: Selection<
    SVGCircleElement,
    GNode,
    SVGGElement,
    unknown
  > | null = null;
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
      .on("zoom", (ev: D3ZoomEvent<SVGSVGElement, unknown>) =>
        this.gRoot.attr("transform", ev.transform.toString()),
      );
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

    // Reuse node objects across rebuilds so positions persist (no
    // "explosion" when a new event crosses the cursor mid-play). New nodes
    // are seeded next to an already-placed neighbour, not at the origin.
    const nodeSet2 = new Set(nodeIds);
    for (const id of [...this.nodeById.keys()]) {
      if (!nodeSet2.has(id)) this.nodeById.delete(id);
    }
    const neighbours = new Map<string, string[]>();
    for (const l of links) {
      (neighbours.get(l.from) ?? neighbours.set(l.from, []).get(l.from)!).push(
        l.to,
      );
      (neighbours.get(l.to) ?? neighbours.set(l.to, []).get(l.to)!).push(
        l.from,
      );
    }
    const nodes: GNode[] = nodeIds.map((id) => {
      const existing = this.nodeById.get(id);
      if (existing) {
        existing.ev = eligible.get(id)!;
        return existing;
      }
      const seed = (neighbours.get(id) ?? [])
        .map((nid) => this.nodeById.get(nid))
        .find((p) => p && p.x != null);
      const n: GNode = {
        id,
        ev: eligible.get(id)!,
        x: (seed?.x ?? this.w / 2) + (Math.random() - 0.5) * 30,
        y: (seed?.y ?? this.h / 2) + (Math.random() - 0.5) * 30,
      };
      this.nodeById.set(id, n);
      return n;
    });
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

    if (!this.sim) {
      // Created once; the tick reads the latest selections off the instance.
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
        });
    } else {
      // Reuse the simulation: swap data, recentre, and reheat *gently* —
      // barely while auto-playing so the layout stays readable.
      this.sim.nodes(nodes);
      this.linkForce!.links(gl);
      this.sim.force("center", forceCenter(this.w / 2, this.h / 2));
      const target = state.playing ? 0.06 : 0.4;
      this.sim.alpha(Math.max(this.sim.alpha(), target)).restart();
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
}
