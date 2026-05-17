const KEY = "regulaatiotutka.dockHidden";

/**
 * Adds a button that collapses/expands the right dock. Collapsing toggles
 * `dock-collapsed` on <body>; CSS then hides the dock and gives the stage the
 * full width (views re-render via their ResizeObserver). State is persisted.
 */
export function setupDockToggle(container: HTMLElement): void {
  const btn = document.createElement("button");
  btn.className = "about-btn";
  btn.type = "button";

  let hidden = false;
  try {
    hidden = localStorage.getItem(KEY) === "1";
  } catch {
    /* storage disabled */
  }

  const apply = () => {
    document.body.classList.toggle("dock-collapsed", hidden);
    btn.textContent = hidden ? "Näytä paneeli" : "Piilota paneeli";
    btn.title = hidden
      ? "Näytä oikea paneeli"
      : "Piilota oikea paneeli, suurempi näkymä";
  };

  btn.addEventListener("click", () => {
    hidden = !hidden;
    try {
      localStorage.setItem(KEY, hidden ? "1" : "0");
    } catch {
      /* storage disabled */
    }
    apply();
  });

  apply();
  container.appendChild(btn);
}
