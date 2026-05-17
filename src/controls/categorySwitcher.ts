import type { CategoryDimension } from "../state/appState";
import { DIMENSION_LABELS } from "../util/format";

const DIMS: CategoryDimension[] = ["domain", "jurisdiction", "impact"];

/** Segmented control that re-binds the radar's angular sectors. */
export function renderCategorySwitcher(
  el: HTMLElement,
  current: CategoryDimension,
  onChange: (dim: CategoryDimension) => void,
): void {
  el.className = "segmented";
  el.innerHTML = "";
  for (const dim of DIMS) {
    const btn = document.createElement("button");
    btn.textContent = DIMENSION_LABELS[dim];
    btn.classList.toggle("active", dim === current);
    btn.addEventListener("click", () => onChange(dim));
    el.appendChild(btn);
  }
}
