import type {
  Domain,
  ImpactTier,
  Jurisdiction,
} from "../../shared/schema";
import type { AppState, CategoryDimension } from "../state/appState";
import { categoriesFor } from "../state/appState";
import { colorForCategory } from "../util/colors";
import { categoryLabel, DIMENSION_LABELS } from "../util/format";

const ALL_DIMENSIONS: CategoryDimension[] = [
  "domain",
  "jurisdiction",
  "impact",
];

/** The filter facet that a given dimension's legend toggles. */
function facetFor(dim: CategoryDimension): keyof AppState["filters"] {
  return dim === "domain"
    ? "domains"
    : dim === "jurisdiction"
      ? "jurisdictions"
      : "impact";
}

function toggle<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

function withFacet(
  filters: AppState["filters"],
  facet: keyof AppState["filters"],
  next: string[],
): AppState["filters"] {
  switch (facet) {
    case "domains":
      return { ...filters, domains: next as Domain[] };
    case "jurisdictions":
      return { ...filters, jurisdictions: next as Jurisdiction[] };
    case "impact":
      return { ...filters, impact: next as ImpactTier[] };
  }
}

function facetItems(
  dim: CategoryDimension,
  state: AppState,
  onFilterChange: (filters: AppState["filters"]) => void,
): HTMLElement[] {
  const facet = facetFor(dim);
  const active = state.filters[facet] as readonly string[];
  return categoriesFor(dim).map((cat) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    if (active.length && !active.includes(cat)) {
      item.classList.add("inactive");
    }
    item.innerHTML =
      `<span class="legend-swatch" style="background:` +
      `${colorForCategory(dim, cat)}"></span>` +
      `${categoryLabel(dim, cat)}`;
    item.addEventListener("click", () =>
      onFilterChange(withFacet(state.filters, facet, toggle(active as string[], cat))),
    );
    return item;
  });
}

/**
 * The dock's legend-and-filter panel. Clicking an entry toggles it as a filter
 * (empty facet = show all); active filters render the others as inactive.
 *
 * The radar, trend and graph views bind it to the sector dimension, where it
 * doubles as the colour key. The list view has no sectors and no other place
 * to filter from, so it gets **every** facet at once plus a clear button —
 * this panel is then the single home for filtering.
 */
export function renderLegend(
  el: HTMLElement,
  state: AppState,
  onFilterChange: (filters: AppState["filters"]) => void,
): void {
  const dims = state.view === "list" ? ALL_DIMENSIONS : [state.dimension];
  const grouped = dims.length > 1;

  el.innerHTML = "";
  el.className = "legend-panel";
  const title = document.createElement("span");
  title.className = "legend-title";
  title.textContent = grouped
    ? "Suodattimet · klikkaa rajataksesi"
    : "Selite · klikkaa suodattaaksesi";
  el.appendChild(title);

  for (const dim of dims) {
    if (grouped) {
      const group = document.createElement("div");
      group.className = "legend-group";
      const caption = document.createElement("span");
      caption.className = "legend-group-label";
      caption.textContent = DIMENSION_LABELS[dim];
      group.append(caption, ...facetItems(dim, state, onFilterChange));
      el.appendChild(group);
    } else {
      el.append(...facetItems(dim, state, onFilterChange));
    }
  }

  const activeCount =
    state.filters.domains.length +
    state.filters.jurisdictions.length +
    state.filters.impact.length;
  if (grouped && activeCount > 0) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "legend-clear";
    clear.textContent = "Tyhjennä suodattimet";
    clear.addEventListener("click", () =>
      onFilterChange({ domains: [], jurisdictions: [], impact: [] }),
    );
    el.appendChild(clear);
  }
}
