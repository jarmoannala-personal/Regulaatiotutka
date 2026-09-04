/**
 * Free-text search box. Built once (keeps input focus while typing);
 * debounced so the radar/feed don't re-render on every keystroke.
 *
 * Returns a setter for when the query changes from *outside* the box — a
 * shared link that carries `q=` — so the field shows what is filtering.
 * Setting it does not call `onChange`; the caller already owns that state.
 */
export function setupSearch(
  el: HTMLElement,
  onChange: (query: string) => void,
): { setQuery(query: string): void } {
  el.className = "search-box";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Hae säädöstä…";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Hae säädöstä");

  let timer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onChange(input.value.trim()), 180);
  });
  // Esc clears.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input.value) {
      input.value = "";
      onChange("");
    }
  });

  el.appendChild(input);
  return {
    setQuery(query) {
      if (input.value !== query) input.value = query;
    },
  };
}
