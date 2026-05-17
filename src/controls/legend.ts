import type {
  Domain,
  ImpactTier,
  Jurisdiction,
} from "../../shared/schema";
import type { AppState, CategoryDimension } from "../state/appState";
import { categoriesFor } from "../state/appState";
import { colorForCategory } from "../util/colors";
import { categoryLabel } from "../util/format";

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

/**
 * Render the dimension-bound legend. Clicking an entry toggles it as a filter
 * (empty facet = show all); active filters render the others as inactive.
 */
export function renderLegend(
  el: HTMLElement,
  state: AppState,
  onFilterChange: (filters: AppState["filters"]) => void,
): void {
  const dim = state.dimension;
  const facet = facetFor(dim);
  const active = state.filters[facet] as readonly string[];

  el.innerHTML = "";
  el.className = "legend-panel";
  const title = document.createElement("span");
  title.className = "legend-title";
  title.textContent = "Selite · klikkaa suodattaaksesi";
  el.appendChild(title);
  for (const cat of categoriesFor(dim)) {
    const item = document.createElement("span");
    item.className = "legend-item";
    if (active.length && !active.includes(cat)) {
      item.classList.add("inactive");
    }
    item.innerHTML =
      `<span class="legend-swatch" style="background:` +
      `${colorForCategory(dim, cat)}"></span>` +
      `${categoryLabel(dim, cat)}`;
    item.addEventListener("click", () => {
      const nextFacet = toggle(active as string[], cat);
      onFilterChange({
        ...state.filters,
        [facet]:
          facet === "domains"
            ? (nextFacet as Domain[])
            : facet === "jurisdictions"
              ? (nextFacet as Jurisdiction[])
              : (nextFacet as ImpactTier[]),
      });
    });
    el.appendChild(item);
  }
}
