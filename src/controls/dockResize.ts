const KEY = "regulaatiotutka.dockWidth";
const MIN = 220;
const MAX = 680;

function clamp(w: number): number {
  return Math.max(MIN, Math.min(MAX, w));
}

/**
 * Make the right dock horizontally resizable via a left-edge handle.
 * The chosen width is persisted so the feed stays as wide as the user likes.
 */
export function enableDockResize(dock: HTMLElement): void {
  const stored = Number(localStorage.getItem(KEY));
  if (Number.isFinite(stored) && stored >= MIN) {
    dock.style.width = `${clamp(stored)}px`;
  }

  const handle = document.createElement("div");
  handle.className = "dock-resize";
  handle.title = "Vedä leventääksesi";
  dock.appendChild(handle);

  let startX = 0;
  let startW = 0;

  const onMove = (e: PointerEvent) => {
    // Dock is right-anchored: dragging left widens it.
    const w = clamp(startW + (startX - e.clientX));
    dock.style.width = `${w}px`;
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
