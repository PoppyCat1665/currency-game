# Main Menu Background (aurora + currency symbols + particle network)

## Goal
Make the main menu less boring by adding a lively, theme-matched animated background
behind the menu card, while keeping the card readable and all existing functionality
untouched. Combine the three styles the user selected:
  1. Floating currency symbols
  2. Animated gradient/aurora blobs
  3. Particle network (dots + connecting lines)

## Versioning (new scheme)
Current version is **v3.14**. From now on small updates use letter suffixes. This change
bumps the menu version label to **v3.14a** (and cache-buster `?v=` to `?v=36`).

## Files to change
- `index.html` — add the background container + sub-layers inside `#menu`; bump version label + `?v=36`.
- `styles.css` — background layer styles, aurora blobs + keyframes, floating-symbol keyframes, rank-red overrides, `prefers-reduced-motion` handling.
- `game.js` — `initMenuBackground()` (builds symbols + particle canvas), start/stop particles tied to menu visibility, resize handling.

## Design decisions
- Background is **menu screen only** (not game/results/settings).
- All background layers are `pointer-events: none` so nothing blocks clicks.
- The menu card already has `backdrop-filter: blur(8px)` and sits on top (give card `position: relative; z-index: 1`), so background blurs behind it and stays readable.
- **Reduced motion:** respect `prefers-reduced-motion` — disable symbol/aurora animation and particle drift (render static dots only) via a media query + a JS check.
- **Performance:** cap particle count to viewport area (e.g. ~ 90 dots), cap `devicePixelRatio` at 2, pause the animation loop while the menu is not the active screen, and stop when the tab is hidden.
- **Rank mode tie-in:** when the user picks RANKED, the existing `body.rank-active` theme applies; add overrides so the aurora blobs / symbols tint toward red for consistency.

## Implementation steps

### 1. `index.html`
- Inside `#menu` (before the `.menu-card`), add:
  ```
  <div id="menuBg" class="menu-bg" aria-hidden="true">
    <div class="bg-aurora"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
    <div id="bgSymbols" class="bg-symbols"></div>
    <canvas id="bgCanvas" class="bg-canvas"></canvas>
  </div>
  ```
- Bump `v3.14` -> `v3.14a` in the version element; change all `?v=35` -> `?v=36`.

### 2. `styles.css`
- `.menu-bg`: `position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0;` (menu-card gets `position:relative; z-index:1`).
- `.bg-aurora .blob`: large blurred radial-gradient circles using the blue/cyan palette, `position:absolute`, slow `@keyframes` (translate/scale), `filter: blur(60px)`, low opacity.
- `.bg-symbols .sym`: `position:absolute`, muted color, various font sizes/opacities, `@keyframes driftUp` (translateY from bottom to top + slight rotate/scale), staggered `animation-duration`/`delay`.
- `.bg-canvas`: `position:absolute; inset:0; width/height 100%;`.
- `body.rank-active .bg-aurora .blob` / `.bg-symbols .sym`: red tint overrides.
- `@media (prefers-reduced-motion: reduce)`: disable aurora/symbol animations.

### 3. `game.js`
- Add `const MENU_SYMBOLS = ["$","€","£","¥","₹","₩","₽","₺","₫","₱","₿"];`
- `initMenuBackground()`:
  - Populate `#bgSymbols` with ~18–24 symbol spans (random left, size, duration, delay).
  - Set up the particle canvas: `ParticleNetwork` mini-class with dots that drift and draw lines between nearby dots using the accent color; run via `requestAnimationFrame`; resize on window resize (debounced, reuse existing `debounce`).
  - Respect `prefers-reduced-motion`: if reduced, draw a static frame and skip the loop.
- Wire start/stop to menu visibility:
  - In `showScreen(name)`: if `name === "menu"` start the canvas loop (and restart symbol animations if needed), else stop it. (Minimal, single hook point.)
  - Also stop the loop on `visibilitychange` (document hidden) and resume on visible only if the menu screen is showing.
- `body` `overflow:hidden` already prevents scrollbars; ensure `.menu-bg` uses fixed positioning within the menu screen.

## Validation
- Load the page: menu shows drifting currency symbols + animated aurora + particle network behind a readable card; buttons still clickable (background is pointer-events-none).
- Start Play and Ranked: background hidden during game; returns on back-to-menu.
- Pick RANKED: background tints red (consistent with `rank-active` theme).
- Toggle OS "reduce motion": animations stop, static background remains.
- Check on iPad/tablet: no jank; particle count reasonable; nothing blocks tapping menu buttons.
- `node --check game.js` passes; all referenced element IDs exist.

## Notes / risks
- Canvas is decorative only; if it errors on an unsupported browser it must fail silently (try/catch).
- Keep particle work off when the menu isn't visible to avoid wasting battery/CPU.
- The version scheme moving forward: current `v3.14`, this update `v3.14a`, then `v3.14b`, etc.
