# Theme color customization (normal + rank) & answer-pulse toggle

## Goal
1. Add an **answer pulse toggle** (ON by default) so the reveal pulse is optional.
2. Add **theme color customization** for both Normal mode and Rank mode. Choosing a color recolors *everything* that has a color theme — buttons, borders, toggles, glows, map blobs/particles, and the correct/wrong answer colors. Correct = a **light** shade of the chosen color, Wrong = a **dark** shade (user-confirmed). Rank mode gets its own color (default red).

## Versioning
Current version label: `v3.14e`. This update bumps to `v3.14f`; cache-buster `?v=` to `?v=41`.

## Files to change
- `index.html` — add a **Theme** settings category (nav button + section) with a Normal color picker and a Rank color picker; add a pulse toggle (Display category); bump version + `?v=41`.
- `styles.css` — replace hardcoded theme colors with CSS variables; add pulse-disable rule; add color-input styling.
- `game.js` — theme palette generator (`applyTheme`), persist new settings, gate the pulse animation on the toggle.

## Design decisions
- **Two base colors**: `themeNormal` (default `#4cc9f0`) and `themeRank` (default `#ef4444`), each persisted in `localStorage`.
- **Palette derivation (JS)**: from a base hex produce:
  - Normal: `--accent` (base), `--good` (light ~+28%), `--bad` (dark ~-28%), `--border` (dark ~-12%), and map tints (dark, desaturated) for legibility.
  - Rank: `--rank` (base), `--rank-light`, `--rank-dark`, `--rank-border`, `--rank-bg`/`--rank-bg2` (heavy dark tints), plus derived good/bad shades.
- **Apply via inline CSS variables** on `document.documentElement` (so both modes coexist; `body.rank-active` rules use `var(--rank-*)`). "Always rank" elements (rank toggle button, RANKED menu button, rank results/badges, danger buttons, rank-opt) use `var(--rank-*)` regardless of mode.
- **Map keeps legibility**: ocean/sphere/country fills use dark tints of the theme color (matching the existing rank behavior of a dark red map).
- **Pulse toggle**: a `body.no-pulse` class disables the pulse animation via CSS. Set/unset on game start; persisted (default ON).

## Implementation steps (ordered)

### 1. HTML — settings categories
- Add `Theme` button to `.settings-nav` (after Countries).
- Add a `<section data-section="theme">` with:
  - "Normal Mode Color" → `<input id="themeNormalInput" type="color" value="#4cc9f0">`
  - "Rank Mode Color" → `<input id="themeRankInput" type="color" value="#ef4444">`
  - A note explaining Correct = light / Wrong = dark, and that both modes recolor everything.
- In Display section add: "Pulse Answer Colors" → `<input id="pulseToggleInput" type="checkbox" checked>`.

### 2. CSS — variables + refactor
- Define default variables in `:root` for both palettes (normal + rank) using the current blue/red values as defaults.
- Convert hardcoded theme colors to `var(--*)`:
  - Normal: `.btn.primary` gradient/shadow, toggles, timer-fill, `--good`/`--bad`, blobs, particles, info-icon, cat-btn active, player-name-badge, results-player, `.country.correct/.wrong` fills.
  - Rank (`body.rank-active ...`): background gradient, menu/results card, settings, primary button, toggles, currency box, timer-fill, stat, map-wrapper, sphere/country, subtitle/hint/version/credit, blobs/particles.
  - Always-rank elements: `.rank-toggle`, `.rank-label`, `.rank-badge`, `.rank-score`, `.results-rank`, `.btn.ranked`, `.btn.danger`, `.rank-opt`, `.rankStat`.
- Add `body.no-pulse .country.correct, body.no-pulse .country.wrong { animation: none; }`.
- Style `input[type="color"]` to match the theme inputs.

### 3. JS — palette + persistence
- Add small color helpers: `hexToRgb`/`shade(hex, amt)` (lighten/darken) in `game.js`.
- `applyTheme()`: read `themeNormal`/`themeRank`, derive palettes, set CSS vars via `document.documentElement.style.setProperty(...)`.
- Persist: add `themeNormal`, `themeRank`, `pulse` to `saveSettings()`/`loadSettings()`; add the two color inputs + pulse toggle to the auto-save listener list.
- In `startGame()`: read `pulse = $("#pulseToggleInput").checked`; toggle `body.classList` `no-pulse` accordingly (also apply in `goToMenu`/init).
- Call `applyTheme()` on load and on each color input `input`/`change`.
- `resetDefaults()`: reset both colors to defaults, pulse ON, then `applyTheme()` + save.

### 4. Pulse behavior note
- Pulse is purely visual (no timing change). It is visible during the interval reveal. With instant-skip (interval off) it only flashes briefly. The toggle defaults ON.

## Validation
- Pick a Normal color → entire normal UI, buttons, blobs, particles, and correct(light)/wrong(dark) change to that color family; map stays legible.
- Pick a Rank color → entire rank theme (menu red state, ranked game map, badges, results) uses it.
- Correct vs Wrong are visually distinct (light vs dark) in both modes.
- Pulse toggle OFF removes the fill/ring pulse; ON restores it; setting persists after reload.
- Settings persist across reload; Reset restores blue/red defaults.
- `node --check game.js` passes; all referenced element IDs exist in HTML.
- Confirm on iPad: color pickers work (native input), pulse/theme apply.

## Risks / notes
- Large CSS refactor: implementer must convert every hardcoded theme color to a variable and verify both `body` normal and `body.rank-active` states visually.
- Keep semantic distinction: Correct=light, Wrong=dark of the same base (not green/red) per user's explicit choice.
- `color` inputs are native; no extra library needed.
