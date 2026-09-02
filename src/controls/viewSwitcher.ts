import type { ViewMode } from "../state/appState";

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "radar", label: "Tutka" },
  { id: "trend", label: "Trendi" },
  { id: "graph", label: "Graafi" },
  { id: "list", label: "Lista" },
];

/** Segmented control switching between the main visualizations. */
export function renderViewSwitcher(
  el: HTMLElement,
  current: ViewMode,
  onChange: (view: ViewMode) => void,
): void {
  el.className = "segmented";
  el.innerHTML = "";
  for (const v of VIEWS) {
    const btn = document.createElement("button");
    btn.textContent = v.label;
    btn.classList.toggle("active", v.id === current);
    btn.addEventListener("click", () => onChange(v.id));
    el.appendChild(btn);
  }
}
