import { scaleBand, scaleTime } from "d3";
import type { RegulationEvent } from "../../shared/schema";
import type { CategoryDimension } from "../state/appState";
import { categoriesFor } from "../state/appState";
import { categoryValue } from "../util/colors";

/** Deterministic [0,1) hash of a string — same blip lands identically always. */
function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // >>> 0 -> unsigned; divide by 2^32 for [0,1)
  return (h >>> 0) / 4294967296;
}

export interface BlipPlacement {
  x: number;
  y: number;
  radius: number;
  angle: number;
}

export interface RadarGeometry {
  cx: number;
  cy: number;
  rInner: number;
  rOuter: number;
  categories: readonly string[];
  /** Epoch ms -> pixel radius (outer = newer). */
  timeToRadius(epochMs: number): number;
  /** Pixel radius -> epoch ms (inverse, for brush linking). */
  radiusToTime(radius: number): number;
  /** Sector arc angles (radians) for a category value. */
  sectorFor(value: string): { start: number; end: number; center: number };
  /** Deterministic, non-overlapping placement of an event's blip. */
  placeBlip(event: RegulationEvent): BlipPlacement;
}

export function createGeometry(
  width: number,
  height: number,
  dimension: CategoryDimension,
  timeDomain: [Date, Date],
): RadarGeometry {
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) / 2;
  const rInner = R * 0.12;
  // Leave headroom outside rOuter for sector labels (square viewBox).
  const rOuter = R * 0.84;

  const categories = categoriesFor(dimension);

  const rScale = scaleTime()
    .domain(timeDomain)
    .range([rInner, rOuter])
    .clamp(true);

  // Full circle starting at the top (12 o'clock).
  const aScale = scaleBand<string>()
    .domain([...categories])
    .range([-Math.PI / 2, Math.PI * 1.5]);
  const sectorWidth = aScale.bandwidth();

  function sectorFor(value: string) {
    const start = aScale(value) ?? -Math.PI / 2;
    return { start, end: start + sectorWidth, center: start + sectorWidth / 2 };
  }

  function placeBlip(event: RegulationEvent): BlipPlacement {
    const value = categoryValue(event, dimension);
    const { center } = sectorFor(value);
    const t = new Date(`${event.dateAnnounced}T12:00:00Z`).getTime();

    // Deterministic jitter: bounded within the sector + small radial wobble.
    const ja = (hash01(event.id) - 0.5) * sectorWidth * 0.72;
    const jr = (hash01(event.id + "r") - 0.5) * 12;
    const angle = center + ja;
    const radius = Math.max(
      rInner,
      Math.min(rOuter, rScale(new Date(t)) + jr),
    );
    return {
      angle,
      radius,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  }

  return {
    cx,
    cy,
    rInner,
    rOuter,
    categories,
    timeToRadius: (ms) => rScale(new Date(ms)),
    radiusToTime: (r) => rScale.invert(r).getTime(),
    sectorFor,
    placeBlip,
  };
}
