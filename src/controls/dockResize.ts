const KEY = "regulaatiotutka.dockWidth";
const MIN = 220;
const MAX = 680;

function clamp(w: number): number {
  return Math.max(MIN, Math.min(MAX, w));
}

/**
 * Make the right dock horizontally resizable via a left-edge handle.
 * The width is persisted and mirrored to the `--dock-w` CSS variable so the
 * stage (radar/trend/graph) reflows to fill the space *next to* the dock
 * rather than being covered by it.
 */
export function enableDockResize(dock: HTMLElement): void {
  const setWidth = (w: number) => {
    const cw = clamp(w);
    dock.style.width = `${cw}px`;
    document.documentElement.style.setProperty("--dock-w", `${cw}px`);
  };

  const stored = Number(localStorage.getItem(KEY));
  setWidth(
    Number.isFinite(stored) && stored >= MIN
      ? stored
      : dock.getBoundingClientRect().width || 244,
  );

  const handle = document.createElement("div");
  handle.className = "dock-resize";
  handle.title = "Vedä leventääksesi";
  dock.appendChild(handle);

  let startX = 0;
  let startW = 0;

  const onMove = (e: PointerEvent) => {
    // Dock is right-anchored: dragging left widens it.
    setWidth(startW + (startX - e.clientX));
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    document.body.style.userSelect = "";
    try {
      localStorage.setItem(KEY, String(parseInt(dock.style.width, 10)));
    } catch {
      /* storage disabled — non-fatal */
    }
  };

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    startW = dock.getBoundingClientRect().width;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}
