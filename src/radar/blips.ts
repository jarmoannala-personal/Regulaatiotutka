import { easeCubicOut, type Selection } from "d3";
import type { RegulationEvent } from "../../shared/schema";
import type { AppState } from "../state/appState";
import { colorForEvent } from "../util/colors";
import { formatDate } from "../util/format";
import { isFiltered, matchesQuery } from "../util/match";
import type { RadarGeometry } from "./geometry";

const IMPACT_RADIUS = { low: 3.5, medium: 5.5, high: 8 } as const;

let tooltip: HTMLDivElement | undefined;
function getTooltip(): HTMLDivElement {
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "radar-tooltip";
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

export interface BlipCallbacks {
  onSelect(event: RegulationEvent): void;
}

/**
 * Render the blips that have "happened" by the current cursor. `events` is
 * already time-filtered by the radar, so new ones pop in (scale + fade) as the
 * cursor advances and shrink away on backward scrub. Facet-filtered blips stay
 * visible but dimmed.
 */
export function renderBlips(
  g: Selection<SVGGElement, unknown, null, undefined>,
  events: RegulationEvent[],
  geom: RadarGeometry,
  state: AppState,
  cb: BlipCallbacks,
): void {
  const tip = getTooltip();

  g.selectAll<SVGCircleElement, RegulationEvent>("circle.blip")
    .data(events, (d) => d.id)
    .join(
      (enter) =>
        enter
          .append("circle")
          .attr("class", "blip")
          .attr("cx", (d) => geom.placeBlip(d).x)
          .attr("cy", (d) => geom.placeBlip(d).y)
          .attr("fill", (d) => colorForEvent(d, state.dimension))
          .attr("r", 0)
          .style("opacity", 0)
          .on("mouseenter", (_e, d) => {
            tip.innerHTML =
              `<strong>${d.title}</strong>${d.summary}` +
              `<div class="meta">${formatDate(d.dateAnnounced)} · ${d.jurisdiction}</div>`;
            tip.classList.add("visible");
          })
          .on("mousemove", (event: MouseEvent) => {
            tip.style.left = `${event.clientX + 14}px`;
            tip.style.top = `${event.clientY + 14}px`;
          })
          .on("mouseleave", () => tip.classList.remove("visible"))
          .on("click", (_e, d) => cb.onSelect(d))
          .call((sel) =>
            sel
              .transition()
              .duration(420)
              .ease(easeCubicOut)
              .attr("r", (d) => IMPACT_RADIUS[d.impactTier])
              .style("opacity", 1),
          ),
      (update) => update,
      (exit) =>
        exit
          .transition()
          .duration(200)
          .attr("r", 0)
          .style("opacity", 0)
          .remove(),
    )
    .attr("cx", (d) => geom.placeBlip(d).x)
    .attr("cy", (d) => geom.placeBlip(d).y)
    .attr("fill", (d) => colorForEvent(d, state.dimension))
    .classed("selected", (d) => d.id === state.selectedEventId)
    .classed(
      "dimmed",
      (d) =>
        isFiltered(d, state.filters) || !matchesQuery(d, state.query),
    );
}

/** Briefly pulse the given blips (the "lightbulb" flash). */
export function flashBlips(
  g: Selection<SVGGElement, unknown, null, undefined>,
  ids: Set<string>,
): void {
  if (ids.size === 0) return;
  g.selectAll<SVGCircleElement, RegulationEvent>("circle.blip")
    .filter((d) => ids.has(d.id))
    .classed("flash", true);
  window.setTimeout(() => {
    g.selectAll<SVGCircleElement, RegulationEvent>("circle.blip").classed(
      "flash",
      false,
    );
  }, 650);
}
