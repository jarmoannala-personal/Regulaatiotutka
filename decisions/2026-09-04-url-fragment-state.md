# 2026-09-04 — Shareable links: the URL fragment mirrors the shareable state

## Decision: mirror the shareable subset of the store (view, dimension, filters, list sort, search, selected act, timeline cursor) into `location.hash`, written with `history.replaceState`, and read it back on load and on `hashchange`

## Context

The app kept all state in `localStorage`, so the address bar was the same on
every page and a user could not point a colleague at "the list, Finnish law
only" or at one specific act. The site is static on two hosts (GitHub Pages
and idle.fi under a `/Regulaatiotutka/` path), so the only URL component the
app owns without server help is the fragment.

## Alternatives considered

- **Query string (`?view=list`).** Works on both hosts too, but every change
  would reload or need `pushState` juggling, and the `base` path handling on
  idle.fi makes a path-like router unattractive. The fragment never reaches
  the server and is the conventional home for client-only state.
- **Merge link state over the recipient's localStorage.** Simpler, but wrong:
  a link that says "list, FI" opened by someone whose stored state has a
  domain filter would show list, FI *and* that domain — not what the sender
  saw. A link is a snapshot: shared keys the fragment omits are defaults.
- **Write every value always.** Stable URLs, but the default state would carry
  a long fragment, and every link would look like a wall of parameters. Only
  non-default values are written, so the default state has no fragment.
- **`pushState` per change.** Would make the back button walk through every
  filter click. `replaceState` keeps history clean, and it also does not fire
  `hashchange`, which keeps the read path (paste/edit) separate from the
  write path.
- **Encode via `URLSearchParams` as-is.** It percent-encodes `:`, `/` and `,`,
  turning `fi:1390/2025` into `fi%3A1390%2F2025`. A small custom encoder keeps
  those readable; parsing still uses `URLSearchParams`, so both forms work.
- **Share the graph's zoom / play mode / speed.** Zoom is not in the store and
  is not what anyone means by "the same page". Mode and speed are device
  preferences; they stay in `localStorage`.

## Reasoning

The codec (`src/state/urlState.ts`) is pure — `serializeHash` / `parseHash` /
`stateFromHash` take the state and a small context (defaults, time range, a
known-id predicate) — so it is unit-tested with `node:test` without a DOM,
which is the first test in the repo (`npm test`, `tsconfig.test.json`). The
parser validates every value against the schema guards, so a stale or
misspelt link degrades to the default for that key instead of filtering to
nothing; an unknown event id (a live act the cap dropped in a later build) is
ignored rather than opening an empty panel. The timeline cursor travels at
day precision (`t=2018-05-25`; `t=2018` also parses) and is clamped to the
dataset's coverage.

The list view renders in chunks of 200, so a linked act far down would have no
row yet: `revealRow` renders up to it and scrolls it into view (`nearest`, so
a click selection on screen does not move).

## Trade-offs accepted

- While the sweep plays, the fragment trails the cursor by up to 250 ms
  (one pending write at a time). It is exact the moment playback stops.
- The fragment is written from the store, so anything that changes the store
  changes the URL — including the recipient's first click. That is the point,
  but it means a pasted link is not "pinned".
- Long search strings percent-encode (`q=arvonlis%C3%A4vero`); browsers show
  them decoded in the address bar, and the codec round-trips them.
