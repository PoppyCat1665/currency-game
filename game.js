/* global d3, topojson, WORLD_TOPOJSON, CURRENCIES, EXAM_CURRENCIES, COUNTRY_CONTINENT, COUNTRY_CODES */

"use strict";

// ================= DOM Helpers =================
function $(id) { return document.getElementById(String(id).replace(/^#/, "")); }

const SCREENS = ["menu", "game", "results"];

function showScreen(name) {
  SCREENS.forEach(id => $(id).classList.toggle("hidden", id !== name));
  // Run the animated menu background only while the menu is the active screen.
  if (typeof setMenuBackgroundActive === "function") {
    setMenuBackgroundActive(name === "menu");
  }
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ================= Cheat mode (dev only) =================
// Secret keybind: hold Shift and press F → R → L in sequence.
// Only works when the game is opened LOCALLY (file:// or localhost) — never on
// the hosted website. When enabled, the correct country is circled automatically
// on every new question for easy development/testing.
let cheatMode = false;
let cheatKeys = "";           // tracks the F-R-L sequence while Shift is held
let cheatLastKeyTime = 0;
const isLocalFile = typeof location !== "undefined"
  && (location.protocol === "file:"
    || location.hostname === "localhost"
    || location.hostname === "127.0.0.1");

// Tiny toast notification that appears regardless of the current screen.
function showToast(msg, isGood) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;background:" + (isGood ? "#14532d" : "#1e3a8a") + ";color:" + (isGood ? "#bbf7d0" : "#bfdbfe") + ";padding:8px 18px;border-radius:99px;font:700 14px/1.2 sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.4);pointer-events:none;";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function toggleCheatMode() {
  cheatMode = !cheatMode;
  if (cheatMode) {
    showToast("🛠 CHEAT MODE ON", true);
    // Reveal the current answer right away.
    if (game && game.phase === "question") {
      if (game.subject === "shape") {
        // Shape mode shows only one country — reveal the name in the prompt box.
        const q = game.questions[game.index];
        $("#currencyName").textContent = q.name;
        $("#currencySymbol").textContent = q.code || "";
      } else {
        ringCorrectForDev();
      }
    }
  } else {
    showToast("🛠 CHEAT MODE OFF", false);
    // Put the shape prompt back if a shape question is on screen.
    if (game && game.phase === "question" && game.subject === "shape") {
      $("#currencyName").textContent = "What country is this?";
      $("#currencySymbol").textContent = "";
    }
  }
}

// Draws the green ring + fill on the current question's correct country.
function ringCorrectForDev() {
  if (!game || !cheatMode) return;
  // Shape mode has no ring — it reveals the answer name instead.
  if (game.subject === "shape") return;
  const q = game.questions[game.index];
  resetCountryClasses();
  markCountries(q.countries, "correct");
  markCircles(q.countries, "correct");
}

// ================= Sound FX (WebAudio, no external files) =================
let audioCtx = null;
let soundsEnabled = true;

function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq, startOffset, duration, type, volume, slideTo) {
  const ctx = audioCtx;
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + startOffset + duration);
  }
  const vol = volume === undefined ? 0.18 : volume;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
  gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + startOffset + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + startOffset);
  osc.stop(ctx.currentTime + startOffset + duration + 0.05);
}

function playSound(name) {
  if (!soundsEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;

  switch (name) {
    case "countdown":
      playTone(660, 0, 0.12, "square", 0.15);
      playTone(990, 0.12, 0.15, "square", 0.15);
      break;
    case "go":
      playTone(1046, 0, 0.25, "square", 0.18);   // C6
      playTone(1318, 0.2, 0.3, "square", 0.18);  // E6
      break;
    case "correct":
      playTone(660, 0, 0.12, "sine", 0.2);
      playTone(880, 0.11, 0.18, "sine", 0.2);
      break;
    case "wrong":
      playTone(200, 0, 0.2, "sawtooth", 0.12, 130);
      playTone(130, 0.16, 0.25, "sawtooth", 0.12, 90);
      break;
    case "timeout":
      playTone(300, 0, 0.15, "triangle", 0.14);
      playTone(180, 0.14, 0.25, "triangle", 0.14, 120);
      break;
    case "click":
      playTone(520, 0, 0.07, "square", 0.06);
      break;
    case "streak":
      playTone(784, 0, 0.1, "square", 0.15);   // G5
      playTone(1046, 0.08, 0.12, "square", 0.15); // C6
      playTone(1318, 0.16, 0.2, "square", 0.18);  // E6
      break;
    case "rankup":
      playTone(523, 0, 0.12, "triangle", 0.16);  // C5
      playTone(659, 0.1, 0.12, "triangle", 0.16); // E5
      playTone(784, 0.2, 0.14, "triangle", 0.16); // G5
      playTone(1046, 0.3, 0.3, "triangle", 0.2);  // C6
      break;
    case "finish":
      playTone(523, 0, 0.16, "sine", 0.2);      // C5
      playTone(659, 0.14, 0.16, "sine", 0.2);   // E5
      playTone(784, 0.28, 0.16, "sine", 0.2);   // G5
      playTone(1046, 0.42, 0.4, "sine", 0.22);  // C6
      break;
  }
}

// ================= Map =================
let svg, mapG, labelsG, highlightG, path, projection, zoomBehavior;
let countryById = new Map();   // numeric id -> country name
let countryFeatures = [];
let currentZoom = null;        // d3.zoom transform, used for zoom-aware labels
let labelData = [];            // cached: {cx, cy, area, name} per country (projection space)
let labelClip = null;          // clipPath rect for labels so off-screen text isn't painted
let pendingZoom = null;        // coalesced zoom transform (applied next frame)
let zoomFrameScheduled = false;
let svgW = 0, svgH = 0;        // cached viewport size

// Sampled boundary points (lon/lat) per country, aligned with countryFeatures.
// Used to turn a "click radius in km" into a real nearby-area hit test.
let countryBoundaries = [];

// Countries available for the Country toggle (id + name), sorted by name.
let countryList = [];

// Country toggle selection: a Set of numeric country ids. Empty means "all".
// Only applies to casual (non-rank, non-exam) play.
const selectedCountries = new Set();

// Country Codes toggle selection: a Set of numeric country ids for the
// COUNTRY CODES mode's own question list. Empty means "all".
const selectedCodes = new Set();

// ===== Subject (Currency / Country Codes / Shape world map vs U.S. States map) =====
// The active subject ("currency" | "states" | "codes" | "shape"). The world-map
// globals above (countryFeatures/countryBoundaries/countryById/countryList) are
// re-pointed to the state datasets when the subject is "states", so every map
// function (labels, hit-testing, rings, names) works for both maps unchanged.
// "codes" and "shape" both use the world map too — codes asks the short 2-letter
// code, shape highlights one country and you type its name.
let gameSubject = "currency";

// Frozen world datasets (built once in initMap) so we can swap back to them.
let worldFeatures = [];
let worldBoundaries = [];
let worldById = new Map();
let worldList = [];

// U.S. states datasets (built once in initUsMap).
let stateFeatures = [];
let stateBoundaries = [];
let stateById = new Map();
let stateList = [];

// U.S. states data, loaded once from lib/us.js + states.js.
const US_STATE_BY_ID = new Map();   // FIPS id (string) -> { code, name, abbr }
const US_STATE_LIST = [];           // sorted [{ code, name, abbr }]
const selectedStates = new Set();   // FIPS ids toggled in the State List

// Build the U.S. states datasets from the topojson + states.js data.
function buildStateData() {
  const features = topojson.feature(US_TOPOJSON, US_TOPOJSON.objects.states).features;
  const byCode = new Map(US_STATES.map(s => [s.code, s]));
  features.forEach(f => {
    const meta = byCode.get(String(f.id));
    if (!meta) return;
    f.id = String(f.id);
    f.properties = { ...(f.properties || {}), name: meta.name };
    US_STATE_BY_ID.set(f.id, meta);
  });

  stateFeatures = features.filter(f => US_STATE_BY_ID.has(String(f.id)));
  stateById = new Map([...US_STATE_BY_ID.entries()].map(([id, m]) => [id, m.name]));
  stateList = stateFeatures
    .map(f => ({ id: f.id, name: f.properties.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  US_STATE_LIST.length = 0;
  US_STATE_LIST.push(...stateList.map(s => ({ ...US_STATE_BY_ID.get(s.id) })));
  US_STATE_LIST.sort((a, b) => a.name.localeCompare(b.name));

  stateBoundaries = stateFeatures.map(f => {
    const geom = f.geometry;
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    const pts = [];
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring) continue;
      const step = Math.max(1, Math.floor(ring.length / 40));
      for (let i = 0; i < ring.length; i += step) pts.push(ring[i]);
    }
    return pts;
  });
}

// Point the "active" map globals at the given subject's data.
function activateSubject(subject) {
  gameSubject = subject;
  if (subject === "states") {
    countryFeatures = stateFeatures;
    countryBoundaries = stateBoundaries;
    countryById = stateById;
    countryList = stateList;
  } else {
    // "currency", "codes", and "shape" all play on the world map.
    countryFeatures = worldFeatures;
    countryBoundaries = worldBoundaries;
    countryById = worldById;
    countryList = worldList;
  }
}

// Canonical question pool for COUNTRY CODES mode: every mapped country that
// has a 2-letter code, deduplicated by id. world-atlas ships a couple of
// duplicate-id features (e.g. Australia plus its Ashmore and Cartier Is.
// outpost share id 36); the last one wins so the name matches the map labels.
function codedCountries() {
  const byId = new Map();
  countryList.forEach(c => {
    if (COUNTRY_CODES[c.id]) byId.set(c.id, { ...c, code: COUNTRY_CODES[c.id] });
  });
  return [...byId.values()];
}

// Canonical country list for SHAPE mode: every mapped country, deduplicated
// by id (same reasoning as codedCountries — keeps "Australia" over the shared
// id-36 outpost so the typed answer matches the map label).
function shapeCountries() {
  const byId = new Map();
  countryList.forEach(c => byId.set(c.id, c));
  return [...byId.values()];
}

// localStorage key for persisting all settings.
const SETTINGS_KEY = "currencyGameSettings_v1";

// Build a sampled boundary-points array for a set of geo features (one entry
// per feature, aligned by index). Used for the km-radius hit test.
function buildBoundariesFor(features) {
  return features.map(f => {
    const geom = f.geometry;
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    const pts = [];
    for (const poly of polys) {
      const ring = poly[0]; // outer ring
      if (!ring) continue;
      const step = Math.max(1, Math.floor(ring.length / 40));
      for (let i = 0; i < ring.length; i += step) pts.push(ring[i]);
    }
    return pts;
  });
}

function buildCountryBoundaries() {
  countryBoundaries = buildBoundariesFor(countryFeatures);
}

// Great-circle distance in km between two [lon, lat] points.
function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]), la2 = toRad(b[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function initMap() {
  svg = d3.select("#map");

  // The projection is re-created per subject in setSubject(); default here so
  // nothing breaks if resizeMap runs before a subject is chosen.
  projection = d3.geoNaturalEarth1();
  path = d3.geoPath(projection);

  zoomBehavior = d3.zoom()
    .scaleExtent([1, 100])
    .clickDistance(5)
    .on("zoom", ev => scheduleZoom(ev.transform));

  svg.call(zoomBehavior)
     .on("dblclick.zoom", null); // disable double-click zoom

  // Reference for diagnostics/testing; harmless.
  svg.node().__zoomBehavior = zoomBehavior;

  // Pen / touch / mouse tap detection. d3-zoom's drag handling can swallow taps
  // from an Apple Pencil or finger, making it pan instead of selecting. We
  // detect a quick, non-dragging pointer lift and resolve it as a selection.
  // Native CAPTURE-phase listeners run before d3-zoom so they can't be blocked,
  // and this is the SINGLE selection path (mouse, touch, pen) — no click
  // handlers — which prevents resolving a guess twice (a "double click").
  const svgNode = svg.node();
  let tapState = null;
  svgNode.addEventListener("pointerdown", ev => {
    if (ev.pointerType === "mouse" && ev.button !== 0) { tapState = null; return; }
    tapState = { x: ev.clientX, y: ev.clientY, t: performance.now(), moved: false };
  }, true);
  svgNode.addEventListener("pointermove", ev => {
    // Record cursor movement for the replay (also fires without tapState).
    if (replayRec && game && game.phase !== "done" && game.phase !== "idle") {
      const rect = document.querySelector(".map-wrapper");
      if (rect) {
        const r = rect.getBoundingClientRect();
        replayRecordPointer(ev.clientX - r.left, ev.clientY - r.top);
      }
    }
    if (!tapState) return;
    if (Math.hypot(ev.clientX - tapState.x, ev.clientY - tapState.y) > 8) tapState.moved = true;
  }, true);
  svgNode.addEventListener("pointerup", ev => {
    if (!tapState) return;
    const s = tapState;
    tapState = null;
    const isTap = !s.moved && (performance.now() - s.t) < 500;
    if (isTap && game && game.phase === "question" && game.tapSelect) {
      resolveQuestionByRadius(ev);
    }
  }, true);
  svgNode.addEventListener("pointercancel", () => { tapState = null; }, true);

  mapG = svg.append("g");

  // Ocean click-catcher under the countries: catches clicks near tiny nations.
  // Selection is handled by the pointer tap detection above.
  mapG.append("path")
      .attr("class", "ocean")
      .attr("d", path({ type: "Sphere" }));

  // Group for the circle markers drawn around highlighted countries.
  // Lives INSIDE mapG so rings inherit the zoom/pan transform and always
  // track their country as the user zooms or pans.
  highlightG = mapG.append("g")
      .attr("class", "highlights")
      .attr("pointer-events", "none");

  // Clip labels to the map viewport so off-screen text isn't painted.
  labelsG = svg.append("g")
      .attr("class", "labels")
      .attr("clip-path", "url(#labelClipPath)");
  const clip = svg.append("defs").append("clipPath").attr("id", "labelClipPath");
  labelClip = clip.append("rect");

  // Sphere + graticule (world map only; hidden for the US states map).
  mapG.append("path")
      .attr("class", "sphere")
      .attr("pointer-events", "none");
  mapG.append("path")
      .attr("class", "graticule")
      .attr("pointer-events", "none");

  // Build both datasets once. The active subject points countryFeatures & co.
  // at one of them; the other stays frozen for instant switching.
  const topo = WORLD_TOPOJSON;
  const features = topojson.feature(topo, topo.objects.countries).features;

  features.forEach(f => {
    if (f.id === undefined || f.id === null) return;
    const numId = Number(f.id);
    if (Number.isNaN(numId)) return;
    f.id = numId;
    worldById.set(numId, f.properties.name);
  });

  worldFeatures = features.filter(f => Number.isInteger(f.id));
  worldBoundaries = buildBoundariesFor(worldFeatures);
  worldList = worldFeatures
    .map(f => ({ id: f.id, name: f.properties.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  buildStateData();

  // Draw the currently selected subject's map.
  setSubject(gameSubject);

  window.addEventListener("resize", debounce(resizeMap, 150));

  resizeMap();

  $("#mapLoading").classList.add("hidden");
}

// Switch the active map between "currency" (world), "codes" (world, prompts
// the 2-letter country code), "shape" (world, type the highlighted country's
// name), and "states" (US). Re-points the active feature globals and
// re-renders the map paths.
function setSubject(subject) {
  if (subject !== "states" && subject !== "codes" && subject !== "shape") subject = "currency";
  activateSubject(subject);
  showFullMap();
  // Shape mode locks the map: the country stays centered and pan/zoom is off.
  if (zoomBehavior) zoomBehavior.filter(() => gameSubject !== "shape");
  if (!mapG) return;

  const isStates = subject === "states";

  // Ocean/sphere/graticule are world-only decorations.
  mapG.select(".ocean").style("display", isStates ? "none" : "");
  mapG.select(".sphere").style("display", isStates ? "none" : "");
  mapG.select(".graticule").style("display", isStates ? "none" : "");

  // The projection changes shape entirely between maps.
  projection = isStates
    ? d3.geoAlbersUsa()
    : d3.geoNaturalEarth1();
  path = d3.geoPath(projection);

  mapG.selectAll("path.country")
      .data(countryFeatures, d => d.id)
      .join("path")
      .attr("class", "country")
      .attr("data-id", d => d.id)
      .attr("pointer-events", "visible")
      // Shape mode hides the hover tooltip: the country name would give the
      // answer away before you type it.
      .on("mousemove", subject === "shape" ? null : ev => moveTooltip(ev))
      .on("mouseover", subject === "shape" ? null : (ev, d) => showTooltip(ev, nameOf(d.id)))
      .on("mouseout", subject === "shape" ? null : hideTooltip);

  highlightG.raise();

  buildCountryBoundaries();

  // Reset zoom for the new map.
  if (zoomBehavior && svg) {
    try {
      svg.call(zoomBehavior.transform, d3.zoomIdentity);
    } catch (e) { /* SVG transform unavailable (e.g. jsdom) — ignore */ }
  }
  currentZoom = null;
  if (typeof resizeMap === "function") resizeMap();
}

function resizeMap() {
  const wrapper = document.querySelector(".map-wrapper");
  if (!wrapper) return;
  const width = wrapper.clientWidth;
  const height = wrapper.clientHeight;
  if (!width || !height) {
    // Layout not applied yet (e.g. screen just became visible) — retry next frame.
    requestAnimationFrame(resizeMap);
    return;
  }

  svgW = width;
  svgH = height;

  svg.attr("viewBox", `0 0 ${width} ${height}`)
     .attr("width", width)
     .attr("height", height);

  // Clip labels to the visible viewport.
  labelClip.attr("x", 0).attr("y", 0).attr("width", width).attr("height", height);

  // Fit the projection to the map: world fits the sphere, US fits the states.
  if (gameSubject === "states") {
    const usFeature = topojson.feature(US_TOPOJSON, US_TOPOJSON.objects.states);
    projection.fitSize([width, height], usFeature);
  } else {
    projection.fitSize([width, height], { type: "Sphere" });
  }
  path = d3.geoPath(projection);

  // Base draw — update in one go with the new projection.
  mapG.select(".ocean").attr("d", path({ type: "Sphere" }));
  mapG.select(".sphere").attr("d", path({ type: "Sphere" }));
  mapG.select(".graticule").attr("d", path(d3.geoGraticule10()));
  mapG.selectAll("path.country").attr("d", d => path(d));

  // Precompute label geometry: centroid + area per country.
  // This is the expensive geo math; do it once per resize, not per zoom frame.
  labelData = countryFeatures.map(d => {
    const c = path.centroid(d);
    if (!isFinite(c[0]) || !isFinite(c[1])) return null;
    return {
      name: d.properties.name,
      cx: c[0],
      cy: c[1],
      area: path.area(d) || 0
    };
  }).filter(Boolean);

  // Labels redraw with the new geometry.
  renderLabels();
}

// ================= Zoom (coalesced to one rAF per frame) =================
function scheduleZoom(transform) {
  pendingZoom = transform;
  if (zoomFrameScheduled) return;
  zoomFrameScheduled = true;
  requestAnimationFrame(() => {
    zoomFrameScheduled = false;
    currentZoom = pendingZoom;
    pendingZoom = null;
    mapG.attr("transform", currentZoom);
    renderLabels();
    replayRecordZoom();
  });
}

// Shape mode: zoom the map in so ONLY the target country fills the viewport —
// you recognize the country from its shape alone. Applies the transform
// directly (bypassing d3-zoom's scale clamp, which is far too small to fit a
// tiny country).
function zoomToCountry(id) {
  const f = countryFeatures.find(c => c.id === id);
  if (!f || !path || !projection) return;
  const b = path.bounds(f);
  if (!isFinite(b[0][0]) || !isFinite(b[1][0]) || !isFinite(b[0][1]) || !isFinite(b[1][1])) return;
  const [[x0, y0], [x1, y1]] = b;
  const w = svgW || 800;
  const h = svgH || 500;
  const k = Math.min(100, 0.9 / Math.max((x1 - x0) / w, (y1 - y0) / h));
  const tx = w / 2 - k * (x0 + x1) / 2;
  const ty = h / 2 - k * (y0 + y1) / 2;
  const z = d3.zoomIdentity.translate(tx, ty).scale(k);
  currentZoom = z;
  if (mapG) mapG.attr("transform", z);
  renderLabels();
}

function renderLabels() {
  const zoom = currentZoom || d3.zoomIdentity;

  // Clear
  labelsG.selectAll("text.label").remove();

  // "Show Country Names on Map" is off — don't draw labels.
  if (!game || !game.showCountryNames) return;

  const placed = [];
  const minGap = 22;                  // min px distance between labels (screen space)
  const baseMinArea = 30;             // min projected area at zoom=1 (px^2)
  const k2 = zoom.k * zoom.k;         // on-screen area grows with zoom²
  const t = d3.zoomIdentity.translate(zoom.x, zoom.y).scale(zoom.k);

  // Use cached centroids/areas — no per-frame path math.
  for (let i = 0; i < labelData.length; i++) {
    const l = labelData[i];
    const area = l.area;

    // Small countries only pass the threshold once zoomed in enough.
    if (!isFinite(area) || area * k2 < baseMinArea) continue;

    const sx = t.applyX(l.cx);
    const sy = t.applyY(l.cy);

    // Skip labels fully outside the viewport (clip already handles painting,
    // but skipping the node entirely is faster).
    if (sx < -120 || sx > svgW + 120 || sy < -60 || sy > svgH + 60) continue;

    // Declutter in screen space
    let tooClose = false;
    for (let j = 0; j < placed.length; j++) {
      const p = placed[j];
      const dx = p[0] - sx, dy = p[1] - sy;
      if (dx * dx + dy * dy < minGap * minGap) { tooClose = true; break; }
    }
    if (tooClose) continue;
    placed.push([sx, sy]);

    labelsG.append("text")
      .attr("class", "label")
      .attr("x", sx)
      .attr("y", sy)
      .text(l.name);
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ================= Map Interactions =================
let game = null;

// Clicking DIRECTLY on a country always counts as a hit on that EXACT country.
// SVG hit-testing guarantees the clicked path is the country under the cursor,
// so a correct country is correct and a wrong country is registered as wrong.
// Every click — whether it lands on the ocean or directly on a country — runs
// the radius-based resolution, so the click radius (in km) applies even when
// the user misclicks a wrong nearby country. If the correct answer country is
// anywhere inside the radius of the click point, it counts as correct.
function onCountryClick(event) {
  if (!game || game.phase !== "question") return;
  // Shape mode is answered by typing — map taps do nothing.
  if (game.subject === "shape") return;
  resolveQuestionByRadius(event);
}

// Clicking the ocean (transparent layer under countries) snaps to the nearest
// country when the click is within the configurable nearby area. The radius is
// set in the menu in kilometers, so tiny countries are easy to hit even when
// their visible shape is a few pixels on screen.

function resolveQuestionByRadius(event) {
  if (!game || game.phase !== "question") return;
  // Shape mode is answered by typing — taps on the map do nothing (this is
  // the real tap path; onCountryClick is a secondary guard).
  if (game.subject === "shape") return;

  const svgRect = svg.node().getBoundingClientRect();
  const px = event.clientX - svgRect.left;
  const py = event.clientY - svgRect.top;

  // Invert the zoom transform to projection (unzoomed) space.
  const z = currentZoom || d3.zoomIdentity;
  const hx = (px - z.x) / z.k;
  const hy = (py - z.y) / z.k;

  // Convert the click point to geographic lon/lat.
  const geo = projection.invert([hx, hy]);
  if (!geo || !isFinite(geo[0]) || !isFinite(geo[1])) return;

  const radiusKm = (game.snapRadiusKm > 0) ? game.snapRadiusKm : 0;

  // Collect every country whose boundary is within the radius, tracking each
  // country's closest distance and the overall nearest one.
  const candidates = [];   // { id, km }
  let nearest = null;
  let nearestKm = Infinity;

  for (let i = 0; i < countryFeatures.length; i++) {
    const f = countryFeatures[i];
    const pts = countryBoundaries[i];
    if (!pts || pts.length === 0) continue;

    let minKm = Infinity;

    // 1) Clicking INSIDE a country's territory counts as a direct hit. This
    //    matters for large countries (Russia, China, USA...) whose interiors
    //    are far from any border point, so the border-radius test alone would
    //    miss them.
    if (d3.geoContains(f, geo)) {
      minKm = 0;
    } else {
      // 2) Otherwise use distance to the country's border (nearby forgiveness).
      for (let j = 0; j < pts.length; j++) {
        const km = haversineKm(geo, pts[j]);
        if (km < minKm) minKm = km;
      }
    }

    if (minKm <= radiusKm) candidates.push({ id: f.id, km: minKm });
    if (minKm < nearestKm) {
      nearestKm = minKm;
      nearest = f;
    }
  }

  // Only resolve if at least one country is actually WITHIN the click radius.
  // If the correct answer is among the in-radius candidates, accept the
  // nearest correct one. Otherwise fall back to the nearest in-radius country
  // so a wrong guess is still marked. A pure ocean click beyond the radius is
  // ignored completely — it never gets snapped to the nearest far-away country.
  if (candidates.length > 0) {
    const q = game.questions[game.index];
    const correctSet = new Set(q.countries);
    let chosenId = null;
    let nearestAnyKm = Infinity;
    let nearestCorrectKm = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.km < nearestAnyKm) nearestAnyKm = c.km;
      if (correctSet.has(c.id) && c.km < nearestCorrectKm) {
        nearestCorrectKm = c.km;
        chosenId = c.id;
      }
    }
    // No correct country in range → use the nearest in-range country.
    if (chosenId === null) {
      for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].km === nearestAnyKm) { chosenId = candidates[i].id; break; }
      }
    }
    resolveQuestion(chosenId);
    lastAnswerTapAt = performance.now();
  }
  // Far from any country (pure ocean click) — ignore completely, don't count a guess.
}

function showTooltip(event, name) {
  // "Show Country Names on Map" is off — no hover name either.
  if (!game || !game.showCountryNames) return;
  const tip = $("#tooltip");
  tip.textContent = name;
  tip.classList.remove("hidden");
  moveTooltip(event);
}

function moveTooltip(event) {
  const tip = $("#tooltip");
  const wrapper = document.querySelector(".map-wrapper");
  const rect = wrapper.getBoundingClientRect();
  tip.style.left = (event.clientX - rect.left + 12) + "px";
  tip.style.top = (event.clientY - rect.top + 12) + "px";
}

function hideTooltip() {
  $("#tooltip").classList.add("hidden");
}

function resetCountryClasses() {
  mapG.selectAll("path.country")
      .classed("correct", false)
      .classed("wrong", false)
      .classed("shape-target", false);
}

// Shape mode hides every country except the target so only ONE shape shows.
// Restore the full world map (ocean, graticule, all countries) when revealing
// the answer or leaving shape mode.
function showFullMap() {
  if (!mapG) return;
  mapG.selectAll("path.country").classed("shape-hide", false);
  mapG.selectAll(".ocean, .sphere, .graticule").classed("shape-hide", false);
}

// JS-driven answer pulse: rapidly flashes the revealed countries' fill so the
// correct/wrong colors are clearly visible (works even if CSS fill animation
// is unsupported). Respects the "Pulse Answer Colors" setting.
let flashTimer = null;
let flashTargets = null;    // last countries flashed, so a new flash can reset them
function flashAnswer(ids, kind) {
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
  // Reset the previous flash's fill so a country never stays bright when a
  // new flash starts (e.g. a wrong guess mid-pulse).
  if (flashTargets) { flashTargets.style("fill", null); flashTargets = null; }
  if (!game || !game.pulse) return;
  const root = getComputedStyle(document.documentElement);
  const base = root.getPropertyValue(kind === "correct" ? "--good" : "--bad").trim();
  const peak = root.getPropertyValue(kind === "correct" ? "--good-pulse" : "--bad-pulse").trim();
  if (!base) return;
  const targets = mapG.selectAll("path.country").filter(d => ids.includes(d.id));
  flashTargets = targets;
  let on = false;
  let n = 0;
  flashTimer = setInterval(() => {
    targets.style("fill", on ? peak : base);
    on = !on;
    if (++n >= 5) {
      clearInterval(flashTimer);
      flashTimer = null;
      flashTargets = null;
      targets.style("fill", null);   // let the class color show again
    }
  }, 140);
}

function clearFlash() {
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
  mapG.selectAll("path.country").style("fill", null);
}

function markCountries(ids, className) {
  mapG.selectAll("path.country")
      .filter(d => ids.includes(d.id))
      .classed(className, true);
}

// Draw a pulsing circle around each highlighted country so tiny countries are
// easy to spot after the answer is revealed. The circle radius adapts to the
// country's size with a generous minimum (screen-space stable at any zoom).
function markCircles(ids, className) {
  ids.forEach(id => {
    const f = countryFeatures.find(c => c.id === id);
    if (!f) return;
    const c = path.centroid(f);
    if (!isFinite(c[0]) || !isFinite(c[1])) return;

    const geoArea = path.area(f) || 0;
    // Radius in projection pixels — the mapG zoom transform scales it along
    // with the country, so the ring always hugs the country while zooming.
    let r = Math.max(16, Math.sqrt(Math.max(geoArea, 80)) * 0.55);
    r = Math.min(r, 40);

    const g = highlightG.append("g")
        .attr("class", "hl " + className)
        .attr("transform", `translate(${c[0]},${c[1]})`);

    g.append("circle").attr("r", r);
    g.append("circle")
        .attr("class", "hl-inner")
        .attr("r", Math.max(9, r * 0.6));
  });
}

function nameOf(id) {
  return countryById.get(id) || "a country";
}

// ================= Feedback / HUD =================
function showFeedback(type, msg) {
  const fb = $("#feedback");
  fb.className = "feedback " + type;
  fb.textContent = msg;
  replayRecord("feedback", { kind: type, msg });
}

function hideFeedback() {
  const fb = $("#feedback");
  fb.className = "feedback hidden";
  fb.textContent = "";
}

let scoreAnimFrame = null;   // cancel any in-flight score tween

// Update the HUD score. In ranked mode the number counts up smoothly from the
// previous value; in casual mode it snaps instantly. `previousScore` is kept in
// sync with the last value actually shown, so a non-scoring update (timeout,
// out-of-guesses) never replays the count-up and never restarts from 0.
function updateScoreDisplay() {
  const el = $("#score");
  const target = game.score;
  replayRecord("score", { value: target });
  if (!game.rankMode) {
    el.textContent = target;
    game.previousScore = target;
    return;
  }
  const from = (typeof game.previousScore === "number") ? game.previousScore : 0;
  if (target === from) {
    if (scoreAnimFrame) cancelAnimationFrame(scoreAnimFrame);
    el.textContent = target;
    game.previousScore = target;
    return;
  }
  const duration = 500; // ms
  const start = performance.now();
  if (scoreAnimFrame) cancelAnimationFrame(scoreAnimFrame);
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = Math.round(from + (target - from) * eased);
    if (t < 1) {
      scoreAnimFrame = requestAnimationFrame(step);
    } else {
      scoreAnimFrame = null;
      game.previousScore = target;   // keep in sync once the count-up finishes
    }
  };
  step();
}

// Floating "+points" notification that pops up over the HUD.
function showScorePop(text, kind) {
  const pop = $("#scorePop");
  pop.textContent = text;
  pop.className = "score-pop " + (kind || "good-pop");
  pop.classList.remove("hidden");
  // restart the animation
  pop.style.animation = "none";
  void pop.offsetWidth;
  pop.style.animation = "";
  setTimeout(() => pop.classList.add("hidden"), 1100);
}

// Update the streak pill (e.g. "🔥 12 ×10" in ranked, "🔥 12" in casual).
// The ×10 multiplier is ranked-only and is always kept in sync with the
// current game mode, so it reliably shows whenever the pill updates.
function updateStreakPill() {
  const pill = $("#streakPill");
  const count = $("#streakCount");
  const mult = $("#streakMult");
  count.textContent = game.streak || 0;
  mult.classList.toggle("hidden", !game.rankMode);
  pill.classList.remove("hidden");
  pill.classList.remove("streak-bump");
  void pill.offsetWidth;
  pill.classList.add("streak-bump");
  replayRecord("streak", { value: game.streak || 0 });
}

// ================= Timers =================
function clearTimer(t) { if (t) clearInterval(t); }

function startTotalTimer() {
  stopTotalTimer();
  game.totalTimerId = setInterval(() => {
    $("#totalTime").textContent = formatTime(performance.now() - game.totalStart);
  }, 100);
}

function stopTotalTimer() {
  if (game && game.totalTimerId) clearInterval(game.totalTimerId);
}

function startGuessTimer() {
  clearTimer(game.guessTimerId);
  game.guessDuration = game.guessMs;
  game.guessDeadline = performance.now() + game.guessMs;
  game.guessStart = performance.now();

  const tick = () => {
    const remain = game.guessDeadline - performance.now();
    if (remain <= 0) {
      clearTimer(game.guessTimerId);
      $("#guessTimeLeft").textContent = "0.0s";
      $("#guessBar").style.width = "0%";
      resolveQuestion(null);
      return;
    }
    $("#guessTimeLeft").textContent = (remain / 1000).toFixed(1) + "s";
    const pct = (remain / game.guessMs) * 100;
    $("#guessBar").style.width = pct + "%";
    $("#guessBar").classList.toggle("low", pct < 25);
  };

  tick();
  game.guessTimerId = setInterval(tick, 50);
}

function stopGuessTimer() {
  clearTimer(game.guessTimerId);
}

// Advance to the next question (or results) immediately, ending the interval.
function advanceInterval(isFinal) {
  clearTimer(game.intervalTimerId);
  $("#intervalSection").classList.add("hidden");
  if (isFinal) {
    showResults();
  } else {
    game.index++;
    showQuestion();
  }
}

// Clicking anywhere during the interval wait skips the remaining wait time.
// Using capture phase on document means it fires even if d3-zoom or a country
// path handler swallows/stops the bubbled event on the map.
// Timestamp of the most recent tap that answered a question. Used to ignore the
// trailing click that a tap generates, so it doesn't instantly skip the reveal.
let lastAnswerTapAt = 0;

function skipInterval() {
  if (!game || game.phase !== "answered") return false;
  // Ignore the click that trails the tap used to answer (it would skip the
  // reveal/pulse immediately).
  if (performance.now() - lastAnswerTapAt < 300) return false;
  const isFinal = game.index === game.total - 1;
  advanceInterval(isFinal);
  return true;
}

function startInterval(isFinal) {
  clearTimer(game.intervalTimerId);

  // Interval wait OFF: advance immediately (truly instant skip).
  const dur = game.intervalMs;
  if (dur <= 0) {
    advanceInterval(isFinal);
    return;
  }

  $("#intervalSection").classList.remove("hidden");
  $("#intervalLabel").textContent = isFinal ? "🎉 Showing results" : "➡ Next question";

  let deadline = performance.now() + dur;

  const tick = () => {
    const remain = deadline - performance.now();
    if (remain <= 0) {
      advanceInterval(isFinal);
      return;
    }
    $("#intervalLeft").textContent = (remain / 1000).toFixed(1) + "s";
    $("#intervalBar").style.width = ((dur - remain) / dur * 100) + "%";
  };

  $("#intervalLeft").textContent = (dur / 1000).toFixed(1) + "s";
  $("#intervalBar").style.width = "0%";
  replayRecord("interval", { final: isFinal, duration: dur });
  tick();
  game.intervalTimerId = setInterval(tick, 50);
}

// ================= Game Flow =================
// Completely wipe the map/game screen so no stale data from the previous
// round (highlighted countries, feedback, tooltip, badges, currency box,
// stats) is visible when a fresh game starts.
function resetGameScreen() {
  // Stop any lingering overlay from a previous ranked countdown.
  $("#countdownOverlay").classList.add("hidden");
  $("#countdownText").textContent = "3";

  // Clear answer markers and country highlight colors.
  if (highlightG) highlightG.selectAll("g.hl").remove();
  resetCountryClasses();
  clearFlash();

  // Clear feedback and tooltip.
  hideFeedback();
  hideTooltip();

  // Reset the currency display to placeholders.
  $("#currencyBox").classList.remove("code-only");
  $("#currencyName").textContent = "–";
  $("#currencySymbol").textContent = "–";

  // Reset the HUD stats.
  $("#score").textContent = "0";
  $("#guessesLeft").textContent = "1";
  $("#guessesLeft").style.color = "var(--text)";
  $("#progress").textContent = "1 / 42";
  $("#totalTime").textContent = "0:00";

  // Hide the optional player name + rank badges.
  $("#playerNameDisplay").classList.add("hidden");
  $("#rankStat").classList.add("hidden");

  // Hide the interval section and reset the guess bar.
  $("#intervalSection").classList.add("hidden");
  $("#guessBar").classList.remove("low");
  $("#guessBar").style.width = "100%";

  // Hide the shape-mode typing box and restore the full world map.
  closeShapeGuess();
  showFullMap();

  // Hide the replay timeline and results details panel.
  $("#replayTimeline").classList.add("hidden");
  $("#resultsDetails").classList.add("hidden");
}

function startGame() {
  // Completely reset the map screen before anything from the previous game.
  resetGameScreen();

  // stop any running timers
  stopTotalTimer();
  if (game) { clearTimer(game.guessTimerId); clearTimer(game.intervalTimerId); clearTimer(game.countdownTimerId); }

  const rankMode = $("#rankModeInput").checked;
  const playerName = $("#playerNameInput").value.trim();

  // Rank mode forces the harder values (13s guess time, no names on the map,
  // a tighter click radius); the rest of the difficulty inputs (guesses,
  // interval) keep the user's own casual settings, and the round count comes
  // from the rank picker.
  // Guess time: ranked forces 13s, casual uses the setting (default 20s).
  const guessSec = rankMode
    ? 13
    : Math.max(1, parseInt($("#guessTimeInput").value, 10) || 20);
  const intervalEnabled = $("#intervalToggleInput").checked;
  const intervalSec = intervalEnabled
    ? Math.max(0, parseInt($("#intervalTimeInput").value, 10) || 3)
    : 0; // interval off -> skip straight to the next round
  const maxGuesses = Math.max(1, parseInt($("#maxGuessesInput").value, 10) || 1);
  // Click radius: ranked forces a fixed hard radius per subject (150 km on the
  // world map for currency & codes, 50 km for states). Casual uses the
  // per-subject setting (currency default 1000, state default 100).
  const snapRadiusKm = rankMode
    ? (gameSubject === "states" ? 50 : 150)
    : (gameSubject === "states"
      ? Math.max(0, parseFloat($("#snapRadiusStateInput").value) || 100)
      : Math.max(0, parseFloat($("#snapRadiusCurrencyInput").value) || 1000));

  // Read display & sound preferences for this session. The "show full name"
  // toggle is per-subject (country vs state) and is always forced off in rank.
  // Country Codes mode always shows the short code, never the full name, and
  // Shape mode never shows the name (that's the answer!).
  const showFullName = rankMode
    ? false
    : (gameSubject === "states"
      ? $("#showFullStateNameInput").checked
      : (gameSubject === "codes" || gameSubject === "shape"
        ? false
        : $("#showFullCountryNameInput").checked));
  // Shape mode also hides the country-name labels on the map — hovering or
  // labels would reveal the answer.
  const showCountryNames = (rankMode || gameSubject === "shape")
    ? false
    : $("#showCountryNamesInput").checked;
  const tapSelect = $("#tapSelectInput").checked;
  soundsEnabled = $("#soundInput").checked;

  // Apply the pulse preference. Pulse is forced off whenever an interval wait
  // is set, so the answer pulse never overlaps the pause between rounds.
  setPulse(intervalSec > 0 ? false : $("#pulseToggleInput").checked);

  // 📚 Exam mode: ON = only the exam countries (large countries in Europe,
  // South America, and Africa) in any world-map subject. OFF = every country
  // is a playable target. States mode always ignores exam mode.
  const examMode = gameSubject !== "states" && $("#examModeInput").checked;

  // Browsers block audio until a user gesture; Start click counts as one.
  ensureAudio();

  // ----- Build the question pool for the active subject -----
  let questions;

  if (gameSubject === "states") {
    // U.S. States mode: each state is a question. The answer target is the
    // state's own FIPS id (single state per question). Ranked mode always
    // plays every state (the State List is ignored). Casual uses the enabled
    // State List.
    const activeStates = rankMode
      ? US_STATE_LIST
      : (selectedStates.size > 0
        ? US_STATE_LIST.filter(s => selectedStates.has(s.code))
        : US_STATE_LIST);
    if (activeStates.length === 0) {
      showToast("⚠ No states selected — enable at least one state in Settings → Question Lists → State List", false);
      return;
    }
    questions = activeStates.map(s => ({
      code: s.abbr,
      name: s.name,
      symbol: s.abbr,
      countries: [s.code]       // the FIPS id of the state itself
    }));
  } else if (gameSubject === "codes") {
    // Country Codes mode: every mapped country is a question. The prompt is
    // its 2-letter ISO code (e.g. "JP"); the answer is the country itself.
    questions = codedCountries().map(c => ({
      code: c.code,
      name: c.name,
      symbol: c.code,
      countries: [c.id]       // the numeric id of the country itself
    }));
    // Country toggle: only in casual (not ranked). Restrict to toggled-on
    // countries in the Country Code List, if any are unselected.
    if (!rankMode && selectedCodes.size > 0 && selectedCodes.size < countryList.length) {
      questions = questions.filter(q => q.countries.some(id => selectedCodes.has(id)));
    }
    // 📚 Exam mode: only large countries in Europe / South America / Africa.
    if (examMode) {
      questions = questions.filter(q => q.countries.some(id => EXAM_COUNTRIES.has(id)));
    }
    if (questions.length === 0) {
      showToast("⚠ No countries selected — enable at least one country in Settings → Question Lists → Country Code List", false);
      return;
    }
  } else if (gameSubject === "shape") {
    // Shape mode: one highlighted country per question; you type its name.
    // Every mapped country (deduped by id) is a question — no question list
    // toggle, so the full world is always in play (Rounds still caps it).
    questions = shapeCountries().map(c => ({
      code: COUNTRY_CODES[c.id] || "",
      name: c.name,
      symbol: "",
      countries: [c.id]       // the numeric id of the country itself
    }));
    // 📚 Exam mode: only large countries in Europe / South America / Africa.
    if (examMode) {
      questions = questions.filter(q => q.countries.some(id => EXAM_COUNTRIES.has(id)));
    }
  } else {
    // Currency mode: build from the real currency data. In 📚 Exam mode,
    // restrict to currencies used by the exam countries (large countries in
    // Europe / South America / Africa). Otherwise use every currency.
    questions = CURRENCIES.map(c => ({ ...c }));
    if (examMode) {
      questions = questions.filter(c => c.countries.some(id => EXAM_COUNTRIES.has(id)));
    }
    // Country toggle: only in casual (not ranked, not exam). Restrict to
    // currencies used by the toggled-on countries, if any are unselected.
    if (!rankMode && !examMode && selectedCountries.size > 0 && selectedCountries.size < countryList.length) {
      questions = questions.filter(q => q.countries.some(id => selectedCountries.has(id)));
    }
    if (questions.length === 0) {
      showToast("⚠ No countries selected — enable at least one country in Settings → Question Lists → Country List", false);
      return;
    }
  }

  questions = shuffle(questions);
  // Rounds: ranked plays a chosen count for currency (50/70/100/all) and every
  // state for states mode. Casual states mode always plays EXACTLY the number
  // of enabled states (the Rounds setting is ignored). Other casual uses the
  // Rounds setting.
  let roundsRequested;
  if (rankMode) {
    roundsRequested = (gameSubject === "states" || pendingRankRounds === "all")
      ? questions.length
      : parseInt(pendingRankRounds, 10) || questions.length;
  } else if (gameSubject === "states") {
    roundsRequested = questions.length;
  } else {
    roundsRequested = Math.max(1, parseInt($("#roundsInput").value, 10) || 40);
  }
  const rounds = Math.min(roundsRequested, questions.length);
  questions = questions.slice(0, rounds);

  // Streak is tracked in every mode (casual + ranked); the extra ranked
  // scoring stats below only apply in rank mode.
  const previousScore = 0;
  const streak = 0;
  const highestStreak = 0;
  const totalSpeedBonus = rankMode ? 0 : null;
  const totalStreakBonus = rankMode ? 0 : null;
  const fastestAnswer = rankMode ? Infinity : null;
  const answerTimes = rankMode ? [] : null;

  game = {
    questions,
    total: questions.length,
    index: 0,
    score: 0,
    previousScore,
    correct: 0,
    incorrect: 0,
    guessMs: guessSec * 1000,
    intervalMs: intervalSec * 1000,
    maxGuesses,
    snapRadiusKm,
    showFullName,
    showCountryNames,
    tapSelect,
    pulse: $("#pulseToggleInput").checked,
    rankMode,
    examMode,
    playerName,
    streak,
    highestStreak,
    totalSpeedBonus,
    totalStreakBonus,
    fastestAnswer,
    answerTimes,
    totalStart: performance.now(),
    totalTimerId: null,
    guessTimerId: null,
    intervalTimerId: null,
    countdownTimerId: null,
    subject: gameSubject,
    enabledCountries: (() => {
      // For the US states map, the details panel lists states instead of
      // countries. Everything else reuses the country machinery below.
      if (gameSubject === "states") {
        const active = selectedStates.size > 0
          ? [...selectedStates]
          : US_STATE_LIST.map(s => s.code);
        return { normal: active, ranked: active, exam: active };
      }
      // Country Codes mode: no exam list — the pool is every mapped country.
      if (gameSubject === "codes") {
        const allCoded = codedCountries().map(c => c.id);
        const active = selectedCodes.size > 0 && selectedCodes.size < countryList.length
          ? [...selectedCodes]
          : allCoded;
        return { normal: active, ranked: allCoded, exam: [...examCountryIds()] };
      }
      // Shape mode: the whole world is always in play (no question list).
      if (gameSubject === "shape") {
        const allShapes = shapeCountries().map(c => c.id);
        return { normal: allShapes, ranked: allShapes, exam: [...examCountryIds()] };
      }
      // In exam mode the toggle selection is temporarily swapped to the exam
      // list, so "Normal Mode" should reflect the user's real selection.
      const normalSrc = $("#examModeInput").checked && savedCountriesBeforeExam
        ? savedCountriesBeforeExam
        : selectedCountries;
      return {
        normal: (normalSrc.size > 0 && normalSrc.size < countryList.length)
          ? [...normalSrc]
          : countryList.map(c => c.id),
        ranked: countryList.map(c => c.id),
        exam: [...examCountryIds()]
      };
    })(),
    phase: "idle"
  };

  showScreen("game");

  // The map wrapper is hidden until now — resize/render once visible.
  // Double rAF ensures the browser has applied the layout change.
  requestAnimationFrame(() => requestAnimationFrame(resizeMap));

  // Reset any zoom from a previous game.
  if (zoomBehavior && svg) {
    svg.call(zoomBehavior.transform, d3.zoomIdentity);
  }

  startTotalTimer();

  // Begin recording everything the player does this run.
  startReplayRecording();

  // Reset interval UI
  $("#intervalSection").classList.add("hidden");
  $("#guessBar").classList.remove("low");
  $("#guessBar").style.width = "100%";

  // Player name badge + rank badge in the HUD
  const nameEl = $("#playerNameDisplay");
  if (playerName) {
    nameEl.textContent = playerName;
    nameEl.classList.remove("hidden");
  } else {
    nameEl.classList.add("hidden");
  }
  const rankStat = $("#rankStat");
  rankStat.classList.toggle("hidden", !rankMode);
  rankStat.classList.toggle("rankStat", rankMode);

  // Streak pill: always visible, reset at the start of a game.
  // The "×10" multiplier text only shows in ranked mode (casual = just number).
  const streakPill = $("#streakPill");
  streakPill.classList.remove("hidden");
  $("#streakCount").textContent = "0";
  $("#streakMult").classList.toggle("hidden", !rankMode);

  // Shape mode skips the countdown so the typing box focuses immediately —
  // on iOS the keyboard opens in the same tap that started the game.
  if (rankMode && gameSubject !== "shape") {
    startRankCountdown();
  } else {
    showQuestion();
  }
}

// Rank mode: 3 → 2 → 1 → START countdown. The map is unclickable
// (phase stays "countdown") until the go signal, then the first
// question begins and the clock starts.
function startRankCountdown() {
  clearTimer(game.countdownTimerId);
  game.phase = "countdown";

  const overlay = $("#countdownOverlay");
  const text = $("#countdownText");
  overlay.classList.remove("hidden");

  const steps = [3, 2, 1];
  let i = 0;

  const tick = () => {
    if (!game) return;
    if (i < steps.length) {
      text.textContent = steps[i];
      replayRecord("countdown", { step: steps[i] });
      text.style.animation = "none";
      void text.offsetWidth; // restart the pop animation
      text.style.animation = "";
      playSound("countdown");
      i++;
    } else {
      text.textContent = "START!";
      text.style.color = "#4ade80";
      text.style.textShadow = "0 0 30px rgba(74, 222, 128, 0.9), 0 0 60px rgba(74, 222, 128, 0.5)";
      text.style.animation = "none";
      void text.offsetWidth;
      text.style.animation = "";
      playSound("go");
      replayRecord("countdown", { step: "GO" });
      overlay.classList.add("hidden");
      text.style.color = "";
      text.style.textShadow = "";
      clearTimer(game.countdownTimerId);
      showQuestion();
      return;
    }
  };

  tick();
  game.countdownTimerId = setInterval(tick, 900);
}

function updateGuessesDisplay() {
  $("#guessesLeft").textContent = game.guessesLeft;
  $("#guessesLeft").style.color = game.guessesLeft === 1 ? "var(--warn)" : "var(--text)";
  replayRecord("guess", { left: game.guessesLeft });
}

function showQuestion() {
  const q = game.questions[game.index];
  game.phase = "question";
  game.guessesLeft = game.maxGuesses;
  updateGuessesDisplay();

  // When the previous round's pulse is still animating into this one (pulse
  // overlap), keep its rings on screen so they fade out naturally instead of
  // being cut off instantly.
  const preservePulse = !!game.pulseOverlap;
  game.pulseOverlap = false;
  if (!preservePulse) {
    highlightG.selectAll("g.hl").remove();
  } else {
    // Let the ring pulse play out (~700ms), then fade the rings away.
    const stale = highlightG.selectAll("g.hl");
    setTimeout(() => {
      stale.classed("fade-out", true);
      setTimeout(() => stale.remove(), 500);
    }, 750);
  }

  if (game.subject === "shape") {
    // Shape mode: the prompt is the highlighted country itself — the box just
    // says what to do, and the typing input appears over the map.
    $("#currencyBox").classList.remove("code-only");
    $("#currencyName").textContent = "What country is this?";
    $("#currencySymbol").textContent = "";
  } else {
    $("#currencyBox").classList.toggle("code-only", !game.showFullName);
    if (game.showFullName) {
      $("#currencyName").textContent = q.name;
    } else {
      $("#currencyName").textContent = q.code;
    }
    // States show just the abbreviation under the name; currencies show the
    // symbol + code. Country Codes mode shows the code as the prompt (the
    // full name is only shown after the answer is revealed).
    if (game.subject === "states") {
      $("#currencySymbol").textContent = q.symbol || "";
    } else if (game.subject === "codes") {
      $("#currencySymbol").textContent = game.showFullName ? q.name : "";
    } else {
      $("#currencySymbol").textContent = q.symbol ? `${q.symbol}   ·   ${q.code}` : q.code;
    }
  }
  $("#progress").textContent = `${game.index + 1} / ${game.total}`;

  resetCountryClasses();
  if (!preservePulse) clearFlash();
  hideFeedback();

  // Shape mode: show the typing box, zoom to ONLY the target country, hide
  // every other country (plus the ocean) so just its shape is on screen, and
  // light it up so you recognize it from its shape alone. No pulsing ring.
  if (game.subject === "shape") {
    showShapeGuess();
    zoomToCountry(q.countries[0]);
    mapG.selectAll("path.country")
        .classed("shape-hide", d => d.id !== q.countries[0]);
    mapG.selectAll(".ocean, .sphere, .graticule").classed("shape-hide", true);
    markCountries([q.countries[0]], "shape-target");
    // Cheat mode (local only): reveal the answer name in the prompt box.
    if (cheatMode && isLocalFile) {
      $("#currencyName").textContent = q.name;
      $("#currencySymbol").textContent = q.code || "";
    }
  }

  // Cheat mode (local only): auto-circle the correct country for dev (shape
  // mode reveals the name instead, handled above).
  if (cheatMode && isLocalFile && game.subject !== "shape") ringCorrectForDev();

  $("#guessBar").classList.remove("low");
  startGuessTimer();

  replayRecord("question", { index: game.index });
}

// Streak bonus points per milestone (10, 20, 30, ...). Each additional
// 10-streak block past 30 gives +500.
function streakBonusFor(n) {
  if (n < 10) return 0;
  if (n < 20) return 100;
  if (n < 30) return 250;
  return 500;
}

// ================= Shape mode: type-the-country-name =================
// The map lights up one country and you type its name into a box with live
// suggestions ("tha" → Thailand, "a" → Australia, Austria, …). Clicking a
// suggestion (or Enter) submits the answer.
let shapeMatches = [];      // current suggestion list (shapeCountries entries)
let shapeSelIndex = -1;     // keyboard-highlighted suggestion

function showShapeGuess() {
  const wrap = $("#shapeGuess");
  if (wrap) wrap.classList.remove("hidden");
  const input = $("#shapeInput");
  if (input) {
    input.value = "";
    // Focus synchronously (inside the Start tap) so the mobile keyboard opens
    // on its own — no need to tap the answer box.
    input.focus({ preventScroll: true });
  }
  const box = $("#shapeSuggest");
  if (box) box.classList.add("hidden");
  shapeMatches = [];
  shapeSelIndex = -1;
  // The map is locked while answering — hide the Reset View button.
  const resetBtn = $("#resetViewBtn");
  if (resetBtn) resetBtn.classList.add("hidden");
}

function closeShapeGuess() {
  const wrap = $("#shapeGuess");
  if (wrap) wrap.classList.add("hidden");
  const box = $("#shapeSuggest");
  if (box) box.classList.add("hidden");
  shapeMatches = [];
  shapeSelIndex = -1;
  const resetBtn = $("#resetViewBtn");
  if (resetBtn) resetBtn.classList.remove("hidden");
}

function highlightShapeSel() {
  const box = $("#shapeSuggest");
  if (!box) return;
  [...box.children].forEach((el, i) => el.classList.toggle("sel", i === shapeSelIndex));
}

function renderShapeSuggest() {
  const input = $("#shapeInput");
  const box = $("#shapeSuggest");
  if (!input || !box) return;
  const val = input.value.trim().toLowerCase();
  if (!val || !game || game.phase !== "question" || game.subject !== "shape") {
    box.classList.add("hidden");
    box.innerHTML = "";
    shapeMatches = [];
    shapeSelIndex = -1;
    return;
  }
  shapeMatches = shapeCountries()
    .filter(c => c.name.toLowerCase().startsWith(val))
    .slice(0, 20);
  if (shapeMatches.length === 0) {
    box.classList.add("hidden");
    box.innerHTML = "";
    shapeSelIndex = -1;
    return;
  }
  box.innerHTML = "";
  shapeMatches.forEach(c => {
    const row = document.createElement("div");
    row.className = "shape-opt";
    row.textContent = c.name;
    // mousedown (not click) so picking works before the input's blur hides it.
    row.addEventListener("mousedown", ev => {
      ev.preventDefault();
      submitShapeAnswer(c.name);
    });
    box.appendChild(row);
  });
  box.classList.remove("hidden");
  shapeSelIndex = 0;
  highlightShapeSel();
}

function onShapeKeydown(e) {
  if (!game || game.phase !== "question" || game.subject !== "shape") return;
  const box = $("#shapeSuggest");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (shapeMatches.length) {
      shapeSelIndex = (shapeSelIndex + 1) % shapeMatches.length;
      highlightShapeSel();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (shapeMatches.length) {
      shapeSelIndex = (shapeSelIndex - 1 + shapeMatches.length) % shapeMatches.length;
      highlightShapeSel();
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    // One suggestion left? Submit it directly. Otherwise submit the
    // highlighted one (or the raw typed text if nothing is highlighted).
    if (shapeMatches.length === 1) {
      submitShapeAnswer(shapeMatches[0].name);
    } else if (shapeMatches.length > 1 && shapeSelIndex >= 0) {
      submitShapeAnswer(shapeMatches[shapeSelIndex].name);
    } else {
      submitShapeAnswer($("#shapeInput").value);
    }
  } else if (e.key === "Escape") {
    if (box) box.classList.add("hidden");
    shapeMatches = [];
    shapeSelIndex = -1;
  }
}

function submitShapeAnswer(name) {
  if (!game || game.phase !== "question" || game.subject !== "shape") return;
  const input = $("#shapeInput");
  const box = $("#shapeSuggest");
  if (box) box.classList.add("hidden");
  shapeMatches = [];
  shapeSelIndex = -1;
  if (input) input.value = "";
  const guess = String(name || "").trim();
  if (!guess) return;
  const q = game.questions[game.index];
  if (guess.toLowerCase() === q.name.toLowerCase()) {
    resolveQuestion(q.countries[0]);
  } else {
    handleTypedWrong();
  }
}

// A wrong typed name: same guess-decrement rules as a wrong map click, but
// there's no country on the map to mark as wrong.
function handleTypedWrong() {
  if (!game || game.phase !== "question") return;
  const q = game.questions[game.index];
  playSound("wrong");
  replayRecord("answer", { index: game.index, clickedId: null, correct: false });

  // A wrong guess resets the streak in EVERY mode (casual + ranked).
  if (game.streak > 0) {
    game.streak = 0;
    updateStreakPill();
  }

  game.guessesLeft--;
  updateGuessesDisplay();

  if (game.guessesLeft > 0) {
    // Remaining attempts on the SAME question — keep the box open to retype.
    const plural = game.guessesLeft === 1 ? "guess" : "guesses";
    showFeedback("no", `❌ Wrong! ${game.guessesLeft} ${plural} left — try again`);
    const input = $("#shapeInput");
    if (input) setTimeout(() => input.focus(), 30);
  } else {
    // Out of attempts — mark failed and reveal the answer.
    game.incorrect++;
    finishQuestion(q);
    showFeedback("no", `❌ Out of guesses! The answer was: ${q.name}`);
    updateScoreDisplay();
  }
}

function resolveQuestion(clickedId) {
  if (!game || game.phase !== "question") return;

  const q = game.questions[game.index];

  // ---------- Time's up: fail the question ----------
  if (clickedId === null) {
    game.incorrect++;
    replayRecord("answer", { index: game.index, clickedId: null, correct: false });
    // A missed question resets the streak in EVERY mode (casual + ranked).
    if (game.streak > 0) {
      game.streak = 0;
      updateStreakPill();
    }
    finishQuestion(q);
    if (game.subject === "states" || game.subject === "codes" || game.subject === "shape") {
      showFeedback("info", `⏰ Time's up! The answer was: ${q.name}`);
    } else {
      showFeedback("info", `⏰ Time's up! ${q.name} is used in: ${answerLabelFor(q)}`);
    }
    playSound("timeout");
    updateScoreDisplay();
    return;
  }

  // ---------- Correct guess ----------
  if (q.countries.includes(clickedId)) {
    game.correct++;
    replayRecord("answer", { index: game.index, clickedId, correct: true });
    const shown = nameOf(clickedId);

    // Streak is tracked in EVERY mode (casual + ranked).
    game.streak++;
    if (game.streak > game.highestStreak) game.highestStreak = game.streak;
    updateStreakPill();

    if (game.rankMode) {
      // Ranked scoring: +100, speed bonus = remaining ms * 10 per second.
      const remainingMs = Math.max(0, game.guessDeadline - performance.now());
      const remainingSec = remainingMs / 1000;
      const speedBonus = Math.floor(remainingSec * 10);
      const gained = 100 + speedBonus;

      // Track answer time for fastest/average. Clamp so an instant answer (or
      // a tiny timing overshoot) can't produce a negative time.
      const answerMs = Math.max(0, game.guessMs - remainingMs);
      game.answerTimes.push(answerMs);
      if (answerMs < game.fastestAnswer) game.fastestAnswer = answerMs;

      // Streak milestone bonus (10/20/30...) — ranked only.
      let streakBonus = 0;
      if (game.streak % 10 === 0) {
        streakBonus = streakBonusFor(game.streak);
        game.totalStreakBonus += streakBonus;
        playSound("streak");
        showScorePop("🔥 " + game.streak + " STREAK! +" + streakBonus, "info-pop");
      }

      game.totalSpeedBonus += speedBonus;
      game.previousScore = game.score;   // start point for the count-up animation
      game.score += gained + streakBonus;

      showScorePop("+" + (gained + streakBonus), "good-pop");
      if (game.subject === "states") {
        showFeedback("ok", `✅ Correct! ${q.name} (+${speedBonus} speed)`);
      } else if (game.subject === "codes") {
        showFeedback("ok", `✅ Correct! ${q.code} → ${q.name} (+${speedBonus} speed)`);
      } else if (game.subject === "shape") {
        showFeedback("ok", `✅ Correct! ${q.name} (+${speedBonus} speed)`);
      } else {
        showFeedback("ok", `✅ Correct! ${q.name} → ${shown} (+${speedBonus} speed)`);
      }
      playSound("correct");
    } else {
      // Casual: +1 point per correct answer as before.
      game.score++;
      showScorePop("+1", "good-pop");
      if (game.subject === "states") {
        showFeedback("ok", `✅ Correct! ${q.name}`);
      } else if (game.subject === "codes") {
        showFeedback("ok", `✅ Correct! ${q.code} → ${q.name}`);
      } else if (game.subject === "shape") {
        showFeedback("ok", `✅ Correct! ${q.name}`);
      } else {
        showFeedback("ok", `✅ Correct! ${q.name} → ${shown}`);
      }
      playSound("correct");
    }

    finishQuestion(q);
    updateScoreDisplay();
    return;
  }

  // ---------- Wrong guess ----------
  markCountries([clickedId], "wrong");
  markCircles([clickedId], "wrong");
  // If a pulse is already running (e.g. the previous answer's reveal bleeding
  // into this round), let it finish instead of cutting it off mid-pulse.
  if (!flashTimer) flashAnswer([clickedId], "wrong");
  playSound("wrong");
  replayRecord("answer", { index: game.index, clickedId, correct: false });

  // A wrong guess resets the streak in EVERY mode (casual + ranked).
  if (game.streak > 0) {
    game.streak = 0;
    updateStreakPill();
  }

  game.guessesLeft--;
  updateGuessesDisplay();

  if (game.guessesLeft > 0) {
    // Remaining attempts on the SAME question — continue the turn.
    const plural = game.guessesLeft === 1 ? "guess" : "guesses";
    showFeedback("no", `❌ Wrong! ${game.guessesLeft} ${plural} left — try again`);
  } else {
    // Out of attempts — mark failed and reveal the answer.
    game.incorrect++;
    finishQuestion(q);
    if (game.subject === "states" || game.subject === "codes" || game.subject === "shape") {
      showFeedback("no", `❌ Out of guesses! The answer was: ${q.name}`);
    } else {
      showFeedback("no", `❌ Out of guesses! ${q.name} is used in: ${answerLabelFor(q)}`);
    }
    updateScoreDisplay();
  }
}

function answerLabelFor(q) {
  const answerNames = q.countries.map(nameOf);
  return q.countries.length === 1
    ? answerNames[0]
    : answerNames.slice(0, 3).join(", ") + (q.countries.length > 3 ? "…" : "");
}

// Reveal the correct answer + name, then advance to the next question.
function finishQuestion(q) {
  game.phase = "answered";
  stopGuessTimer();

  // Highlight correct answer with fill + circle ring.
  markCountries(q.countries, "correct");
  markCircles(q.countries, "correct");
  flashAnswer(q.countries, "correct");
  replayRecord("reveal", { index: game.index });

  // Always reveal the full currency name once the answer is in.
  $("#currencyBox").classList.remove("code-only");
  $("#currencyName").textContent = q.name;

  // Shape mode: the typing box is done for this round — hide it and bring the
  // whole world back so the reveal shows where the country sits.
  if (game.subject === "shape") {
    closeShapeGuess();
    showFullMap();
  }

  const isFinal = game.index === game.total - 1;

  if (isFinal) {
    stopTotalTimer();
    game.totalElapsed = performance.now() - game.totalStart;
    playSound("finish");
    startInterval(true);
  } else if (game.pulse) {
    // Pulse on: start the next round immediately while the answer pulse is
    // still animating — the pulse fades out on its own, the clock keeps going.
    game.pulseOverlap = true;
    advanceInterval(false);
  } else {
    startInterval(false);
  }
}

// Rank based on accuracy percentage (from the scoring doc).
function rankForAccuracy(pct) {
  if (pct >= 100) return "SS";
  if (pct >= 98) return "S";
  if (pct >= 95) return "A";
  if (pct >= 90) return "B";
  if (pct >= 80) return "C";
  if (pct >= 70) return "D";
  return "F";
}

// ================= Results =================
function showResults() {
  game.phase = "done";

  const accuracyPct = Math.round((game.correct / game.total) * 100);
  $("#finalScore").textContent = game.score;
  $("#finalCorrect").textContent = game.correct;
  $("#finalIncorrect").textContent = game.incorrect;
  $("#finalAccuracy").textContent = accuracyPct + "%";
  $("#finalTime").textContent = formatTime(game.totalElapsed || 0);
  $("#finalAvg").textContent = ((game.totalElapsed || 0) / 1000 / game.total).toFixed(1) + "s";
  $("#finalRadius").textContent = game.snapRadiusKm + " km";

  // Player name + rank badge on the results screen
  const pName = $("#finalPlayerName");
  if (game.playerName) {
    pName.textContent = "Player: " + game.playerName;
    pName.classList.remove("hidden");
  } else {
    pName.classList.add("hidden");
  }
  const pRank = $("#finalRankBadge");
  pRank.classList.toggle("hidden", !game.rankMode);

  // Highest streak is shown in EVERY mode (casual + ranked).
  const streakStat = $("#streakStat");
  $("#finalStreak").textContent = game.highestStreak || 0;
  streakStat.classList.remove("hidden");

  // Enabled-answer details: only the set that was actually active for this
  // game (exam list in exam mode, all in ranked, the toggle selection in
  // casual). Grouped by continent for countries; listed flat for states.
  const ec = game.enabledCountries || { normal: [], ranked: [], exam: [] };
  const activeIds = game.examMode ? ec.exam : (game.rankMode ? ec.ranked : ec.normal);
  const activeNames = activeIds.map(id => nameOf(id)).sort((a, b) => a.localeCompare(b));

  const contEl = $("#detailContinents");
  contEl.innerHTML = "";
  if (game.subject === "states") {
    const head = document.createElement("h4");
    head.textContent = "United States";
    const names = document.createElement("p");
    names.className = "detail-list";
    names.textContent = activeNames.join(", ") || "—";
    contEl.appendChild(head);
    contEl.appendChild(names);
  } else {
    const byCont = {};
    activeIds.forEach(id => {
      const cont = COUNTRY_CONTINENT[id] || "Other";
      (byCont[cont] = byCont[cont] || []).push(id);
    });
    CONTINENT_ORDER.concat(["Other"]).forEach(cont => {
      const ids = byCont[cont];
      if (!ids || ids.length === 0) return;
      const head = document.createElement("h4");
      head.textContent = cont;
      const names = document.createElement("p");
      names.className = "detail-list";
      names.textContent = ids.map(nameOf).sort((a, b) => a.localeCompare(b)).join(", ");
      contEl.appendChild(head);
      contEl.appendChild(names);
    });
  }

  $("#detailCount").textContent = activeNames.length + (game.subject === "states" ? " states" : " countries");
  $("#resultsDetails").classList.add("hidden");
  $("#detailsBtn").classList.remove("hidden");

  // Rank mode extra stats: rank box, fastest answer.
  const rankBox = $("#rankScoreBox");
  const fastestStat = $("#fastestStat");
  if (game.rankMode) {
    const rank = rankForAccuracy(accuracyPct);
    $("#finalRank").textContent = rank;
    $("#finalRankPoints").textContent = game.score + " pts";
    rankBox.classList.remove("hidden");
    playSound("rankup");

    $("#finalFastest").textContent = Number.isFinite(game.fastestAnswer)
      ? (game.fastestAnswer / 1000).toFixed(1) + "s"
      : "–";   // no correct answers this game
    fastestStat.classList.remove("hidden");
  } else {
    rankBox.classList.add("hidden");
    fastestStat.classList.add("hidden");
  }

  // Record the finished run so it can be downloaded as a replay.
  replayRecord("result", {
    score: game.score,
    correct: game.correct,
    incorrect: game.incorrect,
    elapsed: game.totalElapsed || 0,
    fastest: Number.isFinite(game.fastestAnswer) ? game.fastestAnswer : null,
    highestStreak: game.highestStreak || 0
  });
  $("#downloadReplayBtn").classList.toggle("hidden", !replayRec);

  showScreen("results");
}

// ================= Replay: recording =================
// Every run is recorded: cursor position (throttled), map zoom/pan, question
// changes, score/streak/guesses, answers and the final results. The recording
// can be downloaded from the results screen and replayed.
let replayRec = null;         // active recording { events, meta, t0 }
let replayLastPointer = 0;    // throttle timestamp for pointer events
let replayLastZoom = 0;       // throttle timestamp for zoom events

function startReplayRecording() {
  if (!game) return;
  replayRec = {
    meta: {
      version: 1,
      savedAt: new Date().toISOString(),
      mode: game.rankMode ? "ranked" : "casual",
      subject: game.subject || "currency",
      settings: {
        rankMode: game.rankMode,
        examMode: game.examMode,
        playerName: game.playerName,
        guessMs: game.guessMs,
        intervalMs: game.intervalMs,
        maxGuesses: game.maxGuesses,
        snapRadiusKm: game.snapRadiusKm,
        showFullName: game.showFullName,
        showCountryNames: game.showCountryNames,
        pulse: game.pulse,
        enabledCountries: game.enabledCountries
      },
      questions: game.questions.map(q => ({ code: q.code, name: q.name, symbol: q.symbol, countries: q.countries }))
    },
    events: [],
    t0: performance.now()
  };
  replayLastPointer = 0;
  replayLastZoom = 0;
}

function replayRecord(type, data) {
  if (!replayRec) return;
  replayRec.events.push({ t: Math.round(performance.now() - replayRec.t0), type, data });
}

function replayRecordPointer(x, y) {
  if (!replayRec) return;
  const now = performance.now();
  if (now - replayLastPointer < 16) return;   // ~60 samples/sec
  replayLastPointer = now;
  replayRecord("pointer", { x, y });
}

function replayRecordZoom() {
  if (!replayRec) return;
  const now = performance.now();
  if (now - replayLastZoom < 80) return;      // ~12 samples/sec
  replayLastZoom = now;
  const z = currentZoom || d3.zoomIdentity;
  replayRecord("zoom", { x: z.x, y: z.y, k: z.k });
}

function stopReplayRecording() {
  replayRec = null;
}

// ================= Replay: playback =================
// Playback drives the map, HUD and results from a saved recording file.
let replayPlay = null;        // { events, idx, t0, meta, mode }
let replayCursorEl = null;    // div shown at the recorded pointer position
let replayRafId = null;
let replayGuessTimerId = null;   // counts the guess bar down during a question
let replayGuessDeadline = 0;

function replayStartGuessTimer() {
  if (replayGuessTimerId) clearInterval(replayGuessTimerId);
  replayGuessDeadline = performance.now() + game.guessMs;
  $("#guessBar").classList.remove("low");
  $("#guessBar").style.width = "100%";
  replayGuessTimerId = setInterval(() => {
    const remain = replayGuessDeadline - performance.now();
    if (remain <= 0) {
      clearInterval(replayGuessTimerId);
      replayGuessTimerId = null;
      $("#guessTimeLeft").textContent = "0.0s";
      $("#guessBar").style.width = "0%";
      $("#guessBar").classList.add("low");
      return;
    }
    $("#guessTimeLeft").textContent = (remain / 1000).toFixed(1) + "s";
    $("#guessBar").style.width = (remain / game.guessMs * 100) + "%";
    $("#guessBar").classList.toggle("low", remain / game.guessMs < 0.25);
  }, 50);
}

function replayStopGuessTimer() {
  if (replayGuessTimerId) { clearInterval(replayGuessTimerId); replayGuessTimerId = null; }
}

function replayCursor() {
  if (replayCursorEl) return replayCursorEl;
  const wrapper = document.querySelector(".map-wrapper");
  if (!wrapper) return null;
  replayCursorEl = document.createElement("div");
  replayCursorEl.className = "replay-cursor";
  wrapper.appendChild(replayCursorEl);
  return replayCursorEl;
}

function replayMoveCursor(x, y) {
  const c = replayCursor();
  if (!c) return;
  c.style.left = x + "px";
  c.style.top = y + "px";
}

function replayRemoveCursor() {
  if (replayCursorEl) {
    replayCursorEl.remove();
    replayCursorEl = null;
  }
}

// Parse a replay file and start playing it.
function startReplay(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); }
    catch (e) { showToast("⚠ Invalid replay file", false); return; }
    if (!data || !Array.isArray(data.events) || !data.meta) {
      showToast("⚠ Not a currency-game replay", false);
      return;
    }
    runReplay(data);
  };
  reader.readAsText(file);
}

// Build a fake game from the replay's meta so the existing HUD/map render
// helpers work unchanged, then step through the events on a timeline.
function runReplay(data) {
  stopReplay();
  const m = data.meta;
  const settings = m.settings || {};

  // Cancel any live game timers and hide the results detail panel.
  if (game) { clearTimer(game.guessTimerId); clearTimer(game.intervalTimerId); clearTimer(game.countdownTimerId); }
  stopTotalTimer();
  $("#countdownOverlay").classList.add("hidden");

  // Swap the map to the recorded subject so rings/labels/hit-testing line up.
  const subj = m.subject === "states" ? "states"
    : (m.subject === "codes" ? "codes"
      : (m.subject === "shape" ? "shape" : "currency"));
  setSubject(subj);

  game = {
    subject: subj,
    questions: (m.questions || []).map(q => ({ ...q })),
    total: (m.questions || []).length,
    index: 0,
    score: 0,
    previousScore: 0,
    correct: 0,
    incorrect: 0,
    guessMs: settings.guessMs || 7000,
    intervalMs: settings.intervalMs || 0,
    maxGuesses: settings.maxGuesses || 1,
    snapRadiusKm: settings.snapRadiusKm || 0,
    showFullName: settings.showFullName !== false,
    showCountryNames: settings.showCountryNames !== false,
    tapSelect: false,
    // Always show the answer pulse + rings during replay so it looks like the
    // live game did.
    pulse: true,
    rankMode: !!settings.rankMode,
    examMode: !!settings.examMode,
    playerName: settings.playerName || "",
    streak: 0,
    highestStreak: 0,
    totalSpeedBonus: 0,
    totalStreakBonus: 0,
    fastestAnswer: Infinity,
    answerTimes: [],
    enabledCountries: settings.enabledCountries || { normal: [], ranked: [], exam: [] },
    totalStart: performance.now(),
    totalTimerId: null,
    guessTimerId: null,
    intervalTimerId: null,
    countdownTimerId: null,
    phase: "replay"
  };

  showScreen("game");
  resetGameScreen();
  // Replays play sounds too; the menu may have suspended the audio context.
  soundsEnabled = true;
  ensureAudio();
  // Ensure the pulse rings aren't disabled by a leftover no-pulse body class.
  setPulse(true);
  $("#streakPill").classList.remove("hidden");
  $("#streakMult").classList.toggle("hidden", !game.rankMode);
  requestAnimationFrame(() => requestAnimationFrame(resizeMap));
  if (zoomBehavior && svg) svg.call(zoomBehavior.transform, d3.zoomIdentity);
  $("#intervalSection").classList.add("hidden");
  $("#guessBar").classList.remove("low");
  $("#guessBar").style.width = "100%";
  $("#currencyBox").classList.toggle("code-only", !game.showFullName);
  hideFeedback();
  replayRemoveCursor();

  replayPlay = {
    events: data.events.slice().sort((a, b) => a.t - b.t),
    idx: 0,
    t0: performance.now(),
    ended: false,
    totalMs: data.events.length
      ? data.events[data.events.length - 1].t
      : 0
  };

  showReplayControls();
  initReplayTimeline();
  replayStep();
}

// Set up the timeline scrubber for this recording.
function initReplayTimeline() {
  const bar = $("#replaySeek");
  const tl = $("#replayTimeline");
  if (!bar || !tl) return;
  const totalMs = replayPlay ? replayPlay.totalMs : 0;
  bar.max = Math.max(1, Math.round(totalMs));
  bar.value = 0;
  $("#replayTimeCur").textContent = "0:00";
  $("#replayTimeTotal").textContent = fmtReplayTime(totalMs);
  tl.classList.remove("hidden");
}

function fmtReplayTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m + ":" + String(s % 60).padStart(2, "0");
}

// Update the scrubber position as the replay advances.
function updateReplayTimeline(now) {
  const bar = $("#replaySeek");
  if (!bar || !replayPlay) return;
  bar.value = Math.min(bar.max, Math.round(now));
  $("#replayTimeCur").textContent = fmtReplayTime(now);
}

// Jump the replay to a specific elapsed time, re-applying all events up to it.
function replaySeekTo(targetMs) {
  if (!replayPlay) return;
  replayPlay.t0 = performance.now() - targetMs;
  replayPlay.idx = 0;
  replayPlay.ended = false;

  // Reset visual state so re-applying events is deterministic.
  if (highlightG) highlightG.selectAll("g.hl").remove();
  resetCountryClasses();
  clearFlash();
  replayStopGuessTimer();
  hideFeedback();
  $("#countdownOverlay").classList.add("hidden");
  game.score = 0;
  game.correct = 0;
  game.incorrect = 0;
  game.streak = 0;
  game.highestStreak = 0;
  game.index = 0;
  $("#score").textContent = "0";
  $("#streakCount").textContent = "0";
  $("#progress").textContent = `1 / ${game.total}`;

  // Re-apply every event that happens at or before the target time.
  const prevSound = soundsEnabled;
  soundsEnabled = false;   // don't blast the audio while scrubbing
  let guard = 0;
  while (replayPlay.idx < replayPlay.events.length &&
         replayPlay.events[replayPlay.idx].t <= targetMs &&
         guard < 100000) {
    applyReplayEvent(replayPlay.events[replayPlay.idx]);
    replayPlay.idx++;
    guard++;
  }
  soundsEnabled = prevSound;

  updateReplayTimeline(targetMs);

  // Continue playing from the seeked position (skip the trailing event check).
  if (replayRafId) cancelAnimationFrame(replayRafId);
  replayRafId = null;
  replayStep();
}

// rAF driver: fire every event whose timestamp has passed.
function replayStep() {
  if (!replayPlay) return;
  if (replayPlay.ended) {
    cancelAnimationFrame(replayRafId);
    replayRafId = null;
    finishReplay();
    return;
  }
  const now = performance.now() - replayPlay.t0;
  updateReplayTimeline(now);
  let guard = 0;
  while (replayPlay.idx < replayPlay.events.length && replayPlay.events[replayPlay.idx].t <= now && guard < 5000) {
    applyReplayEvent(replayPlay.events[replayPlay.idx]);
    replayPlay.idx++;
    guard++;
  }
  if (replayPlay.ended || replayPlay.idx >= replayPlay.events.length) {
    finishReplay();
    return;
  }
  replayRafId = requestAnimationFrame(replayStep);
}

function applyReplayEvent(ev) {
  const d = ev.data || {};
  switch (ev.type) {
    case "pointer":
      replayMoveCursor(d.x, d.y);
      break;
    case "zoom": {
      const z = d3.zoomIdentity.translate(d.x, d.y).scale(d.k);
      currentZoom = z;
      if (mapG) mapG.attr("transform", z);
      renderLabels();
      break;
    }
    case "countdown": {
      const ov = $("#countdownOverlay");
      const txt = $("#countdownText");
      if (d.step === "GO") {
        ov.classList.add("hidden");
        txt.style.color = "";
        txt.style.textShadow = "";
        playSound("go");
      } else {
        ov.classList.remove("hidden");
        txt.textContent = d.step;
        txt.style.color = "";
        txt.style.textShadow = "";
        playSound("countdown");
      }
      break;
    }
    case "question": {
      game.index = d.index;
      const q = game.questions[d.index];
      if (q) {
        game.phase = "question";
        game.guessesLeft = game.maxGuesses;
        // When the previous round's pulse is still animating into this one
        // (reveal recorded right before this question), keep its rings so they
        // fade out naturally instead of being cut off instantly.
        const preservePulse = !!flashTimer;
        if (highlightG) {
          if (!preservePulse) {
            highlightG.selectAll("g.hl").remove();
          } else {
            const stale = highlightG.selectAll("g.hl");
            setTimeout(() => {
              stale.classed("fade-out", true);
              setTimeout(() => stale.remove(), 500);
            }, 750);
          }
        }
        updateGuessesDisplay();
        if (game.subject === "shape") {
          // Shape replays show the highlight on the map; the typing box stays
          // hidden during playback.
          $("#currencyBox").classList.remove("code-only");
          $("#currencyName").textContent = "What country is this?";
          $("#currencySymbol").textContent = "";
          closeShapeGuess();
        } else {
          $("#currencyBox").classList.toggle("code-only", !game.showFullName);
          $("#currencyName").textContent = game.showFullName ? q.name : q.code;
          if (game.subject === "states") {
            $("#currencySymbol").textContent = q.symbol || "";
          } else if (game.subject === "codes") {
            $("#currencySymbol").textContent = game.showFullName ? q.name : "";
          } else {
            $("#currencySymbol").textContent = q.symbol ? `${q.symbol}   ·   ${q.code}` : q.code;
          }
        }
        $("#progress").textContent = `${d.index + 1} / ${game.total}`;
        resetCountryClasses();
        if (!preservePulse) clearFlash();
        hideFeedback();
        $("#intervalSection").classList.add("hidden");
        replayStartGuessTimer();
      }
      break;
    }
    case "guess":
      game.guessesLeft = d.left;
      updateGuessesDisplay();
      break;
    case "streak":
      game.streak = d.value;
      if (d.value > game.highestStreak) game.highestStreak = d.value;
      updateStreakPill();
      break;
    case "score":
      game.score = d.value;
      $("#score").textContent = d.value;
      break;
    case "answer": {
      const q = game.questions[game.index];
      if (!q) break;
      replayStopGuessTimer();
      if (d.correct) {
        game.correct++;
        playSound("correct");
        markCountries(q.countries, "correct");
        markCircles(q.countries, "correct");
        flashAnswer(q.countries, "correct");
      } else if (d.clickedId !== null) {
        game.incorrect++;
        playSound("wrong");
        markCountries([d.clickedId], "wrong");
        markCircles([d.clickedId], "wrong");
        flashAnswer([d.clickedId], "wrong");
      } else {
        game.incorrect++;
        playSound("timeout");
      }
      break;
    }
    case "reveal": {
      const q = game.questions[d.index];
      if (!q) break;
      replayStopGuessTimer();
      game.phase = "answered";
      markCountries(q.countries, "correct");
      markCircles(q.countries, "correct");
      flashAnswer(q.countries, "correct");
      $("#currencyBox").classList.remove("code-only");
      $("#currencyName").textContent = q.name;
      break;
    }
    case "feedback":
      if (d.kind) showFeedback(d.kind, d.msg || "");
      break;
    case "interval": {
      replayStopGuessTimer();
      if (d.final) break;
      $("#intervalSection").classList.remove("hidden");
      $("#intervalLabel").textContent = "➡ Next question";
      const dur = d.duration || 0;
      $("#intervalLeft").textContent = (dur / 1000).toFixed(1) + "s";
      $("#intervalBar").style.width = "0%";
      break;
    }
    case "result": {
      // The run ended; carry the recorded stats into the fake game so the
      // results screen shows exactly what the original player saw.
      game.score = d.score || 0;
      game.correct = d.correct || 0;
      game.incorrect = d.incorrect || 0;
      game.totalElapsed = d.elapsed || 0;
      game.fastestAnswer = (d.fastest == null) ? Infinity : d.fastest;
      game.highestStreak = d.highestStreak || 0;
      game.phase = "done";
      replayPlay.ended = true;
      break;
    }
    default:
      break;
  }
}

function finishReplay() {
  if (!replayPlay) return;
  const q = game.questions[game.index];
  if (q) { $("#currencyName").textContent = q.name; }
  replayRemoveCursor();
  stopReplay();
  showResults();
}

function stopReplay() {
  if (replayRafId) cancelAnimationFrame(replayRafId);
  replayRafId = null;
  replayStopGuessTimer();
  replayPlay = null;
  $("#replayTimeline").classList.add("hidden");
  replayRemoveCursor();
}

// ================= Replay: UI =================
function showReplayControls() {
  // Hide the Stop button's normal purpose during replay is fine; just ensure
  // the results details panel is hidden until the run ends.
  $("#resultsDetails").classList.add("hidden");
}

function downloadReplay() {
  if (!replayRec) return;
  const blob = new Blob([JSON.stringify(replayRec, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `currency-replay-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ================= Error reporting (visible on screen) =================
window.addEventListener("error", ev => {
  const div = document.createElement("div");
  div.textContent = "⚠ " + ev.message + "\n" + (ev.error && ev.error.stack ? ev.error.stack : "");
  div.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:99999;background:#7f1d1d;color:#fff;padding:8px 14px;border-radius:8px;font:11px monospace;max-width:90vw;white-space:pre-wrap;";
  document.body.appendChild(div);
});

// ================= Rank mode menu toggle =================
// When rank mode is switched ON the menu visibly changes (the whole menu turns
// red, the full-name toggles are forced off) and ranked play uses fixed hard
// values: 13s guess time, no names on the map, and a tighter click radius
// (150 km on the world map for currency/codes/shape, 50 km for states). The
// casual inputs keep the user's own values and are restored when rank is
// switched off.
const RANK_BODY_CLASS = "rank-active";

// 📚 Exam mode = large countries in Europe, South America, and Africa (area
// ≥ 300,000 km², computed from the map geometry). When Exam Mode is on, these
// are the only countries that can appear in any world-map subject.
const EXAM_COUNTRIES = new Set([
  12, 24, 32, 68, 72, 76, 120, 140, 148, 152, 170, 178, 180, 231, 246, 250, 276,
  380, 384, 404, 434, 450, 466, 478, 504, 508, 516, 562, 566, 578, 600, 604,
  616, 643, 706, 710, 716, 724, 728, 729, 752, 804, 818, 834, 862, 894
]);
const EXAM_COUNT = EXAM_COUNTRIES.size;
const FULL_COUNT = CURRENCIES.length;

// Bound the Rounds input to the size of the active pool: EXAM_COUNT in 📚
// mode, FULL_COUNT (or the number of states / coded countries) otherwise.
// Never lets the user request more than exists.
function syncRoundsMax() {
  const roundsEl = $("#roundsInput");
  const max = gameSubject === "states"
    ? US_STATE_LIST.length
    : (gameSubject === "codes"
      ? codedCountries().length
      : (gameSubject === "shape"
        ? shapeCountries().length
        : ($("#examModeInput").checked ? EXAM_COUNT : FULL_COUNT)));
  roundsEl.max = max;
  const v = parseInt(roundsEl.value, 10);
  if (Number.isFinite(v) && v > roundsEl.max) roundsEl.value = roundsEl.max;
}

function applyRankMenuState() {
  const ranked = $("#rankModeInput").checked;
  // Rank mode recolors the app to the ranked theme; the difficulty inputs keep
  // the user's own values, but ranked play forces harder display rules (no
  // full names, no country-name labels), so those toggles are locked off.
  document.body.classList.toggle(RANK_BODY_CLASS, ranked);

  // The full-name + country-name toggles are always off during ranked (and
  // greyed out).
  ["showFullCountryNameInput", "showFullStateNameInput", "showCountryNamesInput"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.disabled = ranked;
    el.classList.toggle("locked", ranked);
    if (ranked) el.checked = false;
  });
}

// ================= Settings overlay (categorized) =================
// Interval Time is visually disabled whenever Interval Wait is off. The Pulse
// Answer Colors toggle is the reverse: it's only usable when Interval Wait is
// off — enabling the wait force-unchecks it, and turning the wait off restores
// the user's previous pulse choice.
function syncIntervalState() {
  const on = $("#intervalToggleInput").checked;
  const t = $("#intervalTimeInput");
  t.disabled = !on;
  t.classList.toggle("locked", !on);
  const p = $("#pulseToggleInput");
  p.disabled = on;
  p.classList.toggle("locked", on);
  // Remember the user's choice when the toggle gets locked, restore it after.
  if (on) {
    if (p.dataset.pref === undefined) p.dataset.pref = p.checked ? "1" : "0";
    p.checked = false;
  } else {
    if (p.dataset.pref !== undefined) {
      p.checked = p.dataset.pref === "1";
      delete p.dataset.pref;
    }
  }
  // The "unavailable" notice only belongs while the pulse option is locked.
  $("#pulseNote").classList.toggle("hidden", !on);
  setPulse(p.checked);
}

// Show only the selected category's settings section + highlight its nav item.
function selectCategory(name) {
  document.querySelectorAll(".cat-section").forEach(s => {
    s.classList.toggle("active", s.dataset.section === name);
  });
  document.querySelectorAll(".cat-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.cat === name);
  });
}

function openSettings() {
  selectCategory("gameplay");
  applyRankMenuState();            // ensure inputs reflect the current (non-rank) menu state
  syncIntervalState();
  openOverlay("settingsOverlay");
}

function closeSettings() {
  saveSettings();
  closeOverlay("settingsOverlay");
}

// ================= Settings persistence (localStorage) =================
// Save all casual settings + the selected country set. Closing settings (or
// changing any option) persists them so nothing is lost on reopen/reload.
function saveSettings() {
  try {
    const data = {
      guessTime: $("#guessTimeInput").value,
      intervalToggle: $("#intervalToggleInput").checked,
      intervalTime: $("#intervalTimeInput").value,
      maxGuesses: $("#maxGuessesInput").value,
      snapRadiusCurrency: $("#snapRadiusCurrencyInput").value,
      snapRadiusState: $("#snapRadiusStateInput").value,
      rounds: $("#roundsInput").value,
      showFullCountryName: $("#showFullCountryNameInput").checked,
      showFullStateName: $("#showFullStateNameInput").checked,
      showCountryNames: $("#showCountryNamesInput").checked,
      tapSelect: $("#tapSelectInput").checked,
      pulse: $("#pulseToggleInput").checked,
      bgEffects: $("#bgEffectsInput").checked,
      bgRate: $("#bgRateInput").value,
      themeNormal: $("#themeNormalInput").value,
      themeRank: $("#themeRankInput").value,
      sound: $("#soundInput").checked,
      examMode: $("#examModeInput").checked,
      playerName: $("#playerNameInput").value,
      countries: [...selectedCountries],
      codes: [...selectedCodes],
      states: [...selectedStates]
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable — ignore */ }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.guessTime !== undefined) $("#guessTimeInput").value = d.guessTime;
    if (d.intervalToggle !== undefined) $("#intervalToggleInput").checked = !!d.intervalToggle;
    if (d.intervalTime !== undefined) $("#intervalTimeInput").value = d.intervalTime;
    if (d.maxGuesses !== undefined) $("#maxGuessesInput").value = d.maxGuesses;
    if (d.snapRadiusCurrency !== undefined) $("#snapRadiusCurrencyInput").value = d.snapRadiusCurrency;
    if (d.snapRadiusState !== undefined) $("#snapRadiusStateInput").value = d.snapRadiusState;
    if (d.rounds !== undefined) $("#roundsInput").value = d.rounds;
    if (d.showFullCountryName !== undefined) $("#showFullCountryNameInput").checked = !!d.showFullCountryName;
    if (d.showFullStateName !== undefined) $("#showFullStateNameInput").checked = !!d.showFullStateName;
    if (d.showCountryNames !== undefined) $("#showCountryNamesInput").checked = !!d.showCountryNames;
    if (d.tapSelect !== undefined) $("#tapSelectInput").checked = !!d.tapSelect;
    if (d.pulse !== undefined) $("#pulseToggleInput").checked = !!d.pulse;
    if (d.bgEffects !== undefined) $("#bgEffectsInput").checked = !!d.bgEffects;
    if (d.bgRate !== undefined) $("#bgRateInput").value = d.bgRate;
    if (d.themeNormal !== undefined) $("#themeNormalInput").value = d.themeNormal;
    if (d.themeRank !== undefined) $("#themeRankInput").value = d.themeRank;
    if (d.sound !== undefined) $("#soundInput").checked = !!d.sound;
    if (d.examMode !== undefined) {
      $("#examModeInput").checked = !!d.examMode;
      $("#menuExamModeInput").checked = !!d.examMode;
    }
    if (d.playerName !== undefined) $("#playerNameInput").value = d.playerName;
    if (Array.isArray(d.countries)) {
      selectedCountries.clear();
      d.countries.forEach(id => selectedCountries.add(Number(id)));
    }
    if (Array.isArray(d.codes)) {
      selectedCodes.clear();
      d.codes.forEach(id => selectedCodes.add(Number(id)));
    }
    if (Array.isArray(d.states)) {
      selectedStates.clear();
      d.states.forEach(id => selectedStates.add(String(id)));
    }
  } catch (e) { /* corrupt save — ignore */ }
}

// ================= Country toggle =================
// Default: every country selected (i.e. no restriction).
function initSelectedCountries() {
  if (selectedCountries.size === 0 && countryList.length) {
    countryList.forEach(c => selectedCountries.add(c.id));
  }
}

// ================= Country Code toggle =================
// Default: every country selected (i.e. no restriction).
function initSelectedCodes() {
  if (selectedCodes.size === 0 && countryList.length) {
    countryList.forEach(c => selectedCodes.add(c.id));
  }
}

// ================= State toggle =================
// Default: every U.S. state selected.
function initSelectedStates() {
  if (selectedStates.size === 0 && US_STATE_LIST.length) {
    US_STATE_LIST.forEach(s => selectedStates.add(s.code));
  }
}

// ================= Country / Country Code toggle lists =================
// Both the Country List and the Country Code List manage the same world
// countries but keep their own selection set (selectedCountries vs
// selectedCodes), so toggling one never affects the other.

// Which selection set a toggle-list element belongs to.
function selForList(el) {
  const list = el && el.closest && el.closest(".country-list");
  if (!list) return selectedCountries;
  if (list.id === "codesList") return selectedCodes;
  if (list.id === "stateList") return selectedStates;
  return selectedCountries;
}

// Build one toggle row for a country in the given selection set.
function makeCountryRow(c, selSet) {
  const label = document.createElement("label");
  label.className = "country-toggle";
  label.dataset.name = c.name.toLowerCase();
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = selSet.has(c.id);
  cb.dataset.id = c.id;
  cb.addEventListener("change", () => {
    if (cb.checked) selSet.add(c.id);
    else selSet.delete(c.id);
    saveSettings();
    updateContinentCounts(label.closest(".country-list"));
  });
  const span = document.createElement("span");
  span.textContent = c.name;
  label.appendChild(cb);
  label.appendChild(span);
  return label;
}

// Toggle every country inside a continent heading on/off.
function toggleContinent(head, selSet) {
  const container = head.parentElement;
  const rows = [];
  let el = head.nextElementSibling;
  while (el && !el.classList.contains("country-continent")) {
    if (el.classList.contains("country-toggle")) rows.push(el);
    el = el.nextElementSibling;
  }
  if (!rows.length) return;
  const allOn = rows.every(r => r.querySelector("input").checked);
  rows.forEach(r => {
    const cb = r.querySelector("input");
    cb.checked = !allOn;
    const raw = cb.dataset.id;
    const id = (selSet === selectedStates) ? raw : Number(raw);
    if (cb.checked) selSet.add(id);
    else selSet.delete(id);
  });
  saveSettings();
  updateContinentCounts(container);
}

// Refresh each continent heading's checkbox + "selected / total" badge.
function updateContinentCounts(container) {
  container = container || document.getElementById("countryList");
  if (!container) return;
  container.querySelectorAll(".country-continent").forEach(head => {
    let total = 0, sel = 0;
    let el = head.nextElementSibling;
    while (el && !el.classList.contains("country-continent")) {
      if (el.classList.contains("country-toggle")) {
        total++;
        if (el.querySelector("input").checked) sel++;
      }
      el = el.nextElementSibling;
    }
    const badge = head.querySelector(".cont-count");
    if (badge) badge.textContent = sel + "/" + total;
    const check = head.querySelector(".cont-check");
    if (check) {
      check.checked = total > 0 && sel === total;
      check.indeterminate = sel > 0 && sel < total;
    }
  });
}

const CONTINENT_ORDER = ["Africa", "Asia", "Europe", "North America", "South America", "Oceania", "Antarctica"];

// Render a continent-grouped country list into a container for a selection set.
function renderContinentList(container, items, selSet) {
  if (!container) return;
  container.innerHTML = "";

  // Group countries by continent (from COUNTRY_CONTINENT), keeping name order.
  const groups = {};
  items.forEach(c => {
    const cont = COUNTRY_CONTINENT[c.id] || "Other";
    (groups[cont] = groups[cont] || []).push(c);
  });

  const appendHeading = cont => {
    const head = document.createElement("div");
    head.className = "country-continent";
    head.dataset.continent = cont;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "cont-check";
    check.addEventListener("change", () => toggleContinent(head, selSet));
    const name = document.createElement("span");
    name.textContent = cont;
    const badge = document.createElement("span");
    badge.className = "cont-count";
    head.appendChild(check);
    head.appendChild(name);
    head.appendChild(badge);
    container.appendChild(head);
    groups[cont].forEach(c => container.appendChild(makeCountryRow(c, selSet)));
    delete groups[cont];
  };

  CONTINENT_ORDER.forEach(cont => {
    if (groups[cont] && groups[cont].length) appendHeading(cont);
  });
  // Any ungrouped fall into "Other" at the end.
  if (groups.Other && groups.Other.length) appendHeading("Other");

  updateContinentCounts(container);
}

function renderCountryList() {
  renderContinentList(document.getElementById("countryList"), countryList, selectedCountries);
}

function renderCodesList() {
  renderContinentList(document.getElementById("codesList"), countryList, selectedCodes);
}

function setAllCountries(on) {
  selectedCountries.clear();
  if (on) countryList.forEach(c => selectedCountries.add(c.id));
  document.querySelectorAll("#countryList .country-toggle input").forEach(cb => { cb.checked = on; });
  saveSettings();
  updateContinentCounts(document.getElementById("countryList"));
}

function setAllCodes(on) {
  selectedCodes.clear();
  if (on) countryList.forEach(c => selectedCodes.add(c.id));
  document.querySelectorAll("#codesList .country-toggle input").forEach(cb => { cb.checked = on; });
  saveSettings();
  updateContinentCounts(document.getElementById("codesList"));
}

// ================= State List (Question Lists settings) =================
// Build one state toggle row.
function makeStateRow(s) {
  const label = document.createElement("label");
  label.className = "country-toggle state-toggle";
  label.dataset.name = s.name.toLowerCase();
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = selectedStates.has(s.code);
  cb.dataset.id = s.code;
  cb.addEventListener("change", () => {
    if (cb.checked) selectedStates.add(s.code);
    else selectedStates.delete(s.code);
    saveSettings();
    updateStateCount();
    updateContinentCounts(label.closest(".country-list"));
  });
  const span = document.createElement("span");
  span.textContent = s.name;
  label.appendChild(cb);
  label.appendChild(span);
  return label;
}

// Render every U.S. state as an individual toggle, respecting the search box.
// Uses the same grid + heading design as the Country / Country Code lists: a
// single "United States" heading (styled like a continent heading) toggles all
// states at once.
function renderStateList() {
  const container = $("#stateList");
  if (!container) return;
  container.innerHTML = "";

  const q = ($("#stateSearch") || {}).value?.trim().toLowerCase() || "";
  const visible = US_STATE_LIST.filter(s =>
    !q || s.name.toLowerCase().includes(q) || s.abbr.toLowerCase().includes(q));

  const head = document.createElement("div");
  head.className = "country-continent";
  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "cont-check";
  check.addEventListener("change", () => toggleContinent(head, selectedStates));
  const name = document.createElement("span");
  name.textContent = "United States";
  const badge = document.createElement("span");
  badge.className = "cont-count";
  head.appendChild(check);
  head.appendChild(name);
  head.appendChild(badge);
  container.appendChild(head);

  visible.forEach(s => container.appendChild(makeStateRow(s)));

  updateStateCount();
  updateContinentCounts(container);
}

// Show a small "X / N selected" summary for the State List.
function updateStateCount() {
  const el = $("#stateCount");
  if (!el) return;
  const sel = US_STATE_LIST.filter(s => selectedStates.has(s.code)).length;
  el.textContent = sel + " / " + US_STATE_LIST.length + " states";
}

function setAllStates(on) {
  selectedStates.clear();
  if (on) US_STATE_LIST.forEach(s => selectedStates.add(s.code));
  document.querySelectorAll("#stateList input").forEach(cb => { cb.checked = on; });
  saveSettings();
  updateStateCount();
  updateContinentCounts(document.getElementById("stateList"));
}

// Country ids covered by 📚 Exam mode (large countries in Europe, South
// America, and Africa).
let savedCountriesBeforeExam = null;

function examCountryIds() {
  return EXAM_COUNTRIES;
}

// When 📚 Exam mode is ON, the Country toggle is ignored and disabled, and its
// selection is switched to match the exam list. Turning it OFF restores the
// selection the user had before. The Country Code list is disabled too — exam
// mode fixes the countries for every world-map subject.
function syncCountriesState() {
  const examOn = $("#examModeInput").checked;
  if (examOn) {
    if (savedCountriesBeforeExam === null) {
      savedCountriesBeforeExam = new Set(selectedCountries);
    }
    selectedCountries.clear();
    examCountryIds().forEach(id => selectedCountries.add(id));
  } else if (savedCountriesBeforeExam !== null) {
    selectedCountries.clear();
    savedCountriesBeforeExam.forEach(id => selectedCountries.add(id));
    savedCountriesBeforeExam = null;
  }
  renderCountryList();

  const disabled = examOn;
  document.querySelectorAll("#countryList input").forEach(cb => { cb.disabled = disabled; });
  $("#countrySearch").disabled = disabled;
  $("#countryAllBtn").disabled = disabled;
  $("#countryNoneBtn").disabled = disabled;
  $("#countriesDisabledNote").classList.toggle("hidden", !disabled);

  document.querySelectorAll("#codesList input").forEach(cb => { cb.disabled = disabled; });
  $("#codesSearch").disabled = disabled;
  $("#codesAllBtn").disabled = disabled;
  $("#codesNoneBtn").disabled = disabled;
  $("#codesDisabledNote").classList.toggle("hidden", !disabled);

  saveSettings();
}

// Keep the two 📚 Exam toggles (main menu + Settings) in sync and apply the
// exam state: rounds default/max and the disabled question lists.
function setExamMode(on) {
  $("#examModeInput").checked = !!on;
  $("#menuExamModeInput").checked = !!on;
  const roundsEl = $("#roundsInput");
  if (roundsEl.dataset.pref === undefined) {
    roundsEl.dataset.pref = roundsEl.value;
  }
  const ranked = $("#rankModeInput").checked;
  roundsEl.value = on
    ? EXAM_COUNT
    : (ranked ? 55 : 40);
  syncRoundsMax();
  syncCountriesState();
}

// Generic overlay open/close with a short fade/slide animation.
function openOverlay(id) {
  const ov = $(id);
  ov.classList.remove("hidden");
  void ov.offsetWidth;             // force reflow so the open transition plays
  ov.classList.add("open");
}
function closeOverlay(id) {
  const ov = $(id);
  ov.classList.remove("open");
  setTimeout(() => ov.classList.add("hidden"), 220);
}

// Rank mode is driven by the RANKED switch in the menu. When on, the play
// buttons run a hardcore game: 1 guess, no interval wait, 5s per round.
// Currency shows a picker to choose 50/70/100/all rounds; states always plays
// every state.

// Ranked rounds for the current subject. "all" = every available question.
let pendingRankRounds = "all";

// Open the rank-size picker (states always plays every state; codes and
// currency let you choose a round count).
function openRankPicker() {
  // Country Codes and Shape modes: the pool is every mapped country.
  if (gameSubject === "codes" || gameSubject === "shape") {
    $("#rankAllCount").textContent = gameSubject === "codes"
      ? codedCountries().length
      : shapeCountries().length;
    openOverlay("rankPicker");
    return;
  }
  // With Exam mode on (currency only), there's no rank-size choice: play the
  // full exam list (EXAM_COUNT rounds) directly, without showing the picker.
  if ($("#examModeInput").checked) {
    startRankMode("all");
    return;
  }
  // Currency pool size: all available currencies.
  $("#rankAllCount").textContent = FULL_COUNT;
  openOverlay("rankPicker");
}

function startRankMode(rounds) {
  pendingRankRounds = rounds;
  $("#rankModeInput").checked = true;
  applyRankMenuState();
  closeOverlay("rankPicker");
  startGame();
}

// Restore every configurable setting to the game's defaults.
// Default value per setting id (string/number for value inputs, boolean for
// checkboxes). Used by the per-setting reset buttons.
const SETTING_DEFAULTS = {
  guessTimeInput: "20",
  intervalToggleInput: true,
  intervalTimeInput: "3",
  maxGuessesInput: "1",
  snapRadiusCurrencyInput: "1000",
  snapRadiusStateInput: "100",
  roundsInput: "40",
  showFullCountryNameInput: true,
  showFullStateNameInput: true,
  showCountryNamesInput: true,
  tapSelectInput: true,
  pulseToggleInput: true,
  soundInput: true,
  bgEffectsInput: true,
  bgRateInput: "100",
  examModeInput: false,
  themeNormalInput: "#4cc9f0",
  themeRankInput: "#ef4444",
  playerNameInput: ""
};

// Refresh anything that depends on a setting after it changes.
function afterSettingChange(id) {
  if (id === "intervalToggleInput" || id === "intervalTimeInput") syncIntervalState();
  if (id === "examModeInput") setExamMode($("#examModeInput").checked);
  if (id === "roundsInput") syncRoundsMax();
  if (id === "themeNormalInput" || id === "themeRankInput") applyTheme();
  if (id === "pulseToggleInput") setPulse($("#pulseToggleInput").checked);
  if (id === "bgEffectsInput") syncBgEffectsState();
  if (id === "bgRateInput") applyBgRate();
  saveSettings();
}

// Reset a single setting to its default value.
function resetOneSetting(id) {
  if (!(id in SETTING_DEFAULTS)) return;
  const d = SETTING_DEFAULTS[id];
  const el = $("#" + id);
  if (typeof d === "boolean") el.checked = d;
  else el.value = d;
  afterSettingChange(id);
}

// Add a small ↺ reset button to every setting row that has a known default.
function addPerSettingReset() {
  document.querySelectorAll(".setting").forEach(row => {
    const input = row.querySelector("input");
    if (!input || !input.id || !(input.id in SETTING_DEFAULTS)) return;
    if (row.querySelector(".setting-reset")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "setting-reset";
    btn.title = "Reset to default";
    btn.setAttribute("aria-label", "Reset to default");
    btn.textContent = "↺";
    btn.addEventListener("click", e => {
      e.preventDefault();          // don't toggle a parent label's checkbox
      resetOneSetting(input.id);
    });
    row.appendChild(btn);
  });
}

function resetDefaults() {
  $("#guessTimeInput").value = 20;
  $("#intervalToggleInput").checked = true;
  $("#intervalTimeInput").value = 3;
  $("#maxGuessesInput").value = 1;
  $("#snapRadiusCurrencyInput").value = 1000;
  $("#snapRadiusStateInput").value = 100;
  $("#roundsInput").value = 40;
  $("#showFullCountryNameInput").checked = true;
  $("#showFullStateNameInput").checked = true;
  $("#showCountryNamesInput").checked = true;
  $("#soundInput").checked = true;
  $("#examModeInput").checked = false;
  $("#menuExamModeInput").checked = false;
  savedCountriesBeforeExam = null;
  $("#playerNameInput").value = "";
  $("#pulseToggleInput").checked = true;
  $("#themeNormalInput").value = "#4cc9f0";
  $("#themeRankInput").value = "#ef4444";
  $("#bgEffectsInput").checked = true;
  $("#bgRateInput").value = "100";
  setAllCountries(true);   // reset country toggles to all-on
  setAllCodes(true);       // reset country-code toggles to all-on
  setAllStates(true);      // reset state toggles to all-on
  syncRoundsMax();
  syncIntervalState();
  syncCountriesState();    // exam off -> country lists enabled again
  applyTheme();
  applyBgRate();
  setPulse(true);
  saveSettings();
}

// Return to the main menu, always in the normal (non-rank) state.
function goToMenu() {
  stopReplay();
  stopReplayRecording();
  // Fully stop the running game: timers, pulse flash, score tween, and audio.
  if (game) {
    clearTimer(game.guessTimerId);
    clearTimer(game.intervalTimerId);
    clearTimer(game.countdownTimerId);
    game.phase = "done";
  }
  stopTotalTimer();
  clearFlash();
  if (scoreAnimFrame) { cancelAnimationFrame(scoreAnimFrame); scoreAnimFrame = null; }
  $("#scorePop").classList.add("hidden");
  // Silence any in-flight WebAudio tones/oscillators.
  if (audioCtx) audioCtx.suspend().catch(() => {});
  $("#countdownOverlay").classList.add("hidden");
  if (highlightG) highlightG.selectAll("g.hl").remove();
  if (zoomBehavior && svg) {
    svg.call(zoomBehavior.transform, d3.zoomIdentity);
  }
  $("#rankModeInput").checked = false;
  applyRankMenuState();
  // Return the map to the currency subject so the menu/map shows the world.
  setSubject("currency");
  showScreen("menu");
}

// ================= Info "i" tooltips =================
// Desktop shows the ⓘ tip on hover; touch devices (iPad/tablet) show it on tap
// and dismiss on a second tap or tapping elsewhere.
function initInfoTips() {
  const tip = document.createElement("div");
  tip.className = "info-tip";
  document.body.appendChild(tip);

  const IS_TOUCH = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

  const show = icon => {
    const r = icon.getBoundingClientRect();
    tip.textContent = icon.getAttribute("data-info") || "";
    tip.style.left = (r.left + r.width / 2) + "px";
    tip.style.top = r.top + "px";
    tip.classList.add("show");
  };
  const hide = () => tip.classList.remove("show");

  if (!IS_TOUCH) {
    document.addEventListener("mouseover", e => {
      const ic = e.target.closest && e.target.closest(".info-icon");
      if (ic) show(ic);
    });
    document.addEventListener("mouseout", e => {
      if (e.target.closest && e.target.closest(".info-icon")) hide();
    });
  } else {
    document.addEventListener("click", e => {
      const ic = e.target.closest && e.target.closest(".info-icon");
      if (ic) {
        e.preventDefault();
        if (tip.classList.contains("show") && tip.dataset.for === ic.getAttribute("data-info")) {
          hide();
          tip.dataset.for = "";
        } else {
          show(ic);
          tip.dataset.for = ic.getAttribute("data-info");
        }
      } else {
        hide();
        tip.dataset.for = "";
      }
    }, true);
  }
}

// ================= Animated menu background =================
const MENU_SYMBOLS = ["$", "€", "£", "¥", "₹", "₩", "₽", "₺", "₫", "₱", "₿", "¢"];
const REDUCED_MOTION = typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let menuBgActive = false;
let menuParticles = null;          // { start(), stop() } once canvas is ready

// Populate the drifting currency symbols once.
function makeBgSymbols() {
  const wrap = $("#bgSymbols");
  if (!wrap || wrap.dataset.built) return;
  wrap.dataset.built = "1";
  const count = 20;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "sym";
    s.textContent = MENU_SYMBOLS[i % MENU_SYMBOLS.length];
    s.style.left = (Math.random() * 100) + "%";
    s.style.fontSize = (18 + Math.random() * 42) + "px";
    const baseDur = 14 + Math.random() * 18;
    s.dataset.baseDur = baseDur;
    s.style.animationDuration = baseDur + "s";
    s.style.animationDelay = (Math.random() * -24) + "s"; // negative -> already mid-drift
    wrap.appendChild(s);
  }
}

// Set up the particle-network canvas. The animation loop only runs while the
// menu screen is visible (see setMenuBackgroundActive).
function setupParticleCanvas() {
  const canvas = $("#bgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  const P = [];
  let raf = null;
  let rate = 100;                   // current background effect rate (%)

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Scale particle count with the effect rate too.
    const target = Math.round((W * H) / 18000 * Math.min(1.6, Math.max(0.3, rate / 100)));
    while (P.length < target) P.push(makeP());
    P.length = target;
  };

  const makeP = () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.25,
    r: Math.random() * 1.8 + 1
  });

  const step = () => {
    if (rate <= 0) { raf = requestAnimationFrame(step); return; }
    ctx.clearRect(0, 0, W, H);
    const speed = rate / 100;         // velocity multiplier
    const rootStyle = getComputedStyle(document.documentElement);
    const c = (document.body.classList.contains("rank-active")
      ? rootStyle.getPropertyValue("--rank-light-rgb")
      : rootStyle.getPropertyValue("--acc-rgb")).trim() || "76, 201, 240";
    for (const p of P) {
      p.x += p.vx * speed; p.y += p.vy * speed;
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + c + ",0.55)";
      ctx.fill();
    }
    ctx.lineWidth = 0.6;
    const linkDist = 120 * Math.min(1.5, Math.max(0.5, speed));  // density scales with rate
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist * linkDist) {
          const a = 1 - Math.sqrt(d2) / linkDist;
          ctx.strokeStyle = "rgba(" + c + "," + (a * 0.35) + ")";
          ctx.beginPath();
          ctx.moveTo(P[i].x, P[i].y);
          ctx.lineTo(P[j].x, P[j].y);
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(step);
  };

  menuParticles = REDUCED_MOTION ? {
    start() {}, stop() {}, setRate(r) { rate = r; }
  } : {
    start() {
      if (raf !== null || !canvas) return;
      resize();
      raf = requestAnimationFrame(step);
    },
    stop() {
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    },
    setRate(r) {
      rate = r;
      if (rate <= 0) {
        ctx.clearRect(0, 0, W, H);
        canvas.style.display = "none";
      } else {
        canvas.style.display = "";
        if (raf === null && menuBgActive) { resize(); raf = requestAnimationFrame(step); }
      }
    }
  };

  window.addEventListener("resize", debounce(resize, 150));
}

// Start/stop the particle loop depending on whether the menu is shown.
function setMenuBackgroundActive(on) {
  menuBgActive = on;
  if (!menuParticles) return;
  if (on) menuParticles.start();
  else menuParticles.stop();
}

function initMenuBackground() {
  makeBgSymbols();
  setupParticleCanvas();
  // The menu is the initially visible screen; start its animation.
  setMenuBackgroundActive(true);
  // Pause when the tab is hidden to save CPU/battery.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) menuParticles && menuParticles.stop();
    else if (menuBgActive) menuParticles && menuParticles.start();
  });
}

// Background effects enabled + rate (%). When disabled, everything is off.
let bgEffectsEnabled = true;
let bgEffectRate = 100;

// The Background Effects toggle disables/greys the rate input (like Interval
// Wait does for Interval Time).
function syncBgEffectsState() {
  const on = $("#bgEffectsInput") && $("#bgEffectsInput").checked;
  bgEffectsEnabled = !!on;
  const rateEl = $("#bgRateInput");
  if (rateEl) {
    rateEl.disabled = !on;
    rateEl.classList.toggle("locked", !on);
  }
  applyBgRate();
}

// Apply the rate to every animated background layer: floating symbols,
// particle network, and gradient blobs. When effects are disabled (or rate is
// 0), everything is turned off.
function applyBgRate() {
  const el = $("#bgRateInput");
  let rate = el ? parseFloat(el.value) : 100;
  if (!isFinite(rate) || rate < 0) rate = 100;
  if (!bgEffectsEnabled) rate = 0;
  bgEffectRate = rate;

  const off = rate <= 0;
  const mul = off ? 1 : 100 / rate;   // >1 = slower, <1 = faster

  // Floating symbols: scale drift speed (longer duration = slower).
  document.querySelectorAll("#bgSymbols .sym").forEach(s => {
    const base = parseFloat(s.dataset.baseDur) || 16;
    s.style.animationDuration = (base * mul) + "s";
    s.style.animationPlayState = off ? "paused" : "running";
  });
  // When off, hide the symbols layer entirely (also stops layout cost).
  const symWrap = $("#bgSymbols");
  if (symWrap) symWrap.style.display = off ? "none" : "";

  // Gradient blobs: scale float duration; freeze or hide when off.
  document.querySelectorAll(".blob").forEach((b, i) => {
    const base = [18, 22, 26][i % 3];
    b.style.animationDuration = (base * mul) + "s";
    b.style.animationPlayState = off ? "paused" : "running";
  });

  // Particle network: pass the rate to the canvas loop (velocity + draw).
  if (menuParticles && typeof menuParticles.setRate === "function") {
    menuParticles.setRate(rate);
  }
}

// ================= Theme (color customization) =================
// Small color helpers (no dependencies).
function clampByte(n) { return Math.max(0, Math.min(255, Math.round(n))); }

function hexToRgb(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return { r: 76, g: 201, b: 240 };
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// Shift a color toward black (amt<0) or white (amt>0) by a fraction of the way.
function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const t = amt >= 0 ? 255 : 0;
  const a = Math.abs(amt);
  return `#${[r, g, b].map(c => clampByte(c + (t - c) * a).toString(16).padStart(2, "0")).join("")}`;
}

const rgbStr = c => `${c.r}, ${c.g}, ${c.b}`;

// Apply the chosen Normal + Rank theme colors to the CSS variables.
function applyTheme() {
  const normal = $("#themeNormalInput").value || "#4cc9f0";
  const rank = $("#themeRankInput").value || "#ef4444";

  const acc = hexToRgb(normal);
  const rk = hexToRgb(rank);

  const root = document.documentElement.style;
  // Normal palette
  root.setProperty("--accent", normal);
  root.setProperty("--accent-strong", shade(normal, -0.18));
  root.setProperty("--good", shade(normal, 0.20));          // Correct = light shade
  root.setProperty("--good-pulse", shade(normal, 0.92));    // near-white flash
  root.setProperty("--bad", shade(normal, -0.35));          // Wrong = dark shade
  root.setProperty("--bad-pulse", shade(normal, 0.35));     // much lighter flash
  root.setProperty("--border", shade(normal, -0.12));
  root.setProperty("--acc-rgb", rgbStr(acc));
  root.setProperty("--good-rgb", rgbStr(hexToRgb(shade(normal, 0.20))));
  root.setProperty("--bad-rgb", rgbStr(hexToRgb(shade(normal, -0.35))));
  root.setProperty("--primary-shadow", `rgba(${rgbStr(acc)}, 0.35)`);
  root.setProperty("--toggle-bg", `rgba(${rgbStr(acc)}, 0.25)`);
  // Map tints (dark, desaturated for legibility)
  root.setProperty("--sphere", shade(normal, -0.55));
  root.setProperty("--sphere-stroke", shade(normal, -0.45));
  root.setProperty("--map-fill", shade(normal, -0.45));
  root.setProperty("--map-fill-hover", shade(normal, -0.25));
  root.setProperty("--map-stroke", shade(normal, -0.75));

  // Rank palette
  root.setProperty("--rank", rank);
  root.setProperty("--rank-light", shade(rank, 0.12));
  root.setProperty("--rank-dark", shade(rank, -0.25));
  root.setProperty("--rank-border", shade(rank, -0.35));
  root.setProperty("--rank-bg1", shade(rank, -0.5));
  root.setProperty("--rank-bg2", shade(rank, -0.68));
  root.setProperty("--rank-bg3", shade(rank, -0.8));
  root.setProperty("--rank-glow", `rgba(${rgbStr(rk)}, 0.45)`);
  root.setProperty("--rank-glow-soft", `rgba(${rgbStr(rk)}, 0.45)`);
  root.setProperty("--rank-text", shade(rank, 0.32));
  root.setProperty("--rank-dim", shade(rank, 0.10));
  root.setProperty("--rank-faint", shade(rank, -0.15));
  root.setProperty("--rank-card", `rgba(${rgbStr(hexToRgb(shade(rank, -0.5)))}, 0.85)`);
  root.setProperty("--rank-rgb", rgbStr(rk));
  root.setProperty("--rank-light-rgb", rgbStr(hexToRgb(shade(rank, 0.12))));
  root.setProperty("--rank-dark-rgb", rgbStr(hexToRgb(shade(rank, -0.25))));
  root.setProperty("--rank-good", shade(rank, 0.30));       // rank Correct = light
  root.setProperty("--rank-bad", shade(rank, -0.30));       // rank Wrong = dark
  root.setProperty("--rank-good-pulse", shade(rank, 0.60));
  root.setProperty("--rank-bad-pulse", shade(rank, 0.05));

  // Keep particles in sync (they read these next frame via setMenuBackgroundActive).
  if (typeof setMenuBackgroundActive === "function" && menuBgActive) setMenuBackgroundActive(true);
}

// Enable/disable the answer pulse animation from the setting.
function setPulse(enabled) {
  document.body.classList.toggle("no-pulse", !enabled);
}

// ================= Wire up UI =================
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initInfoTips();
  initMenuBackground();

  // Restore persisted settings (needs countryList built by initMap), then
  // render the country toggles and apply menu state.
  loadSettings();
  initSelectedCountries();
  initSelectedCodes();
  initSelectedStates();
  renderCountryList();
  renderCodesList();
  renderStateList();
  addPerSettingReset();
  applyTheme();                    // apply chosen Normal/Rank colors
  syncBgEffectsState();            // apply the saved background effects toggle + rate
  setPulse($("#pulseToggleInput").checked);
  applyRankMenuState();
  syncRoundsMax();
  syncIntervalState();

  // Save any changed casual setting as soon as it changes (on both change and
  // input, so nothing is lost even if the settings panel is closed abruptly).
  [
    "guessTimeInput", "intervalToggleInput", "intervalTimeInput",
    "maxGuessesInput", "snapRadiusCurrencyInput", "snapRadiusStateInput", "roundsInput",
    "showFullCountryNameInput", "showFullStateNameInput", "showCountryNamesInput", "tapSelectInput", "soundInput",
    "bgEffectsInput", "bgRateInput", "examModeInput", "playerNameInput", "pulseToggleInput",
    "themeNormalInput", "themeRankInput"
  ].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", saveSettings);
    el.addEventListener("input", saveSettings);
  });

  // Re-apply the theme live as the color pickers change.
  $("#themeNormalInput").addEventListener("input", applyTheme);
  $("#themeRankInput").addEventListener("input", applyTheme);
  // Background effect rate applied live; the enable toggle greys it out.
  $("#bgRateInput").addEventListener("input", applyBgRate);
  $("#bgEffectsInput").addEventListener("change", syncBgEffectsState);
  // Pulse toggle applied live.
  $("#pulseToggleInput").addEventListener("change", () => setPulse($("#pulseToggleInput").checked));

  // Country & Country Code toggle controls. Both lists filter their own rows
  // by search, so searching one list never hides the other.
  function bindCountrySearch(inputId, containerId) {
    const input = $(inputId);
    const container = $(containerId);
    if (!input || !container) return;
    input.addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll(".country-toggle").forEach(row => {
        row.style.display = row.dataset.name.includes(q) ? "" : "none";
      });
      // Hide continent headings that have no visible countries.
      container.querySelectorAll(".country-continent").forEach(head => {
        let visible = 0;
        let el = head.nextElementSibling;
        while (el && !el.classList.contains("country-continent")) {
          if (el.style.display !== "none") visible++;
          el = el.nextElementSibling;
        }
        head.style.display = visible ? "" : "none";
      });
    });
  }
  bindCountrySearch("countrySearch", "countryList");
  bindCountrySearch("codesSearch", "codesList");
  $("#countryAllBtn").addEventListener("click", () => setAllCountries(true));
  $("#countryNoneBtn").addEventListener("click", () => setAllCountries(false));
  $("#codesAllBtn").addEventListener("click", () => setAllCodes(true));
  $("#codesNoneBtn").addEventListener("click", () => setAllCodes(false));

  // State List controls (Question Lists settings).
  $("#stateSearch").addEventListener("input", renderStateList);
  $("#stateAllBtn").addEventListener("click", () => setAllStates(true));
  $("#stateNoneBtn").addEventListener("click", () => setAllStates(false));
  // Clicking a continent heading toggles every country in it. Clicking the
  // heading's own checkbox is handled by its change event, so ignore it here
  // to avoid toggling twice. Each list (Country / Codes / States) uses its own
  // selection set via selForList.
  document.addEventListener("click", e => {
    const head = e.target.closest && e.target.closest(".country-continent");
    if (head && !e.target.closest(".cont-check")) {
      e.preventDefault();
      toggleContinent(head, selForList(head));
    }
  });
  // Exam mode disables the country toggles (initial state from saved settings).
  syncCountriesState();

  // Mode buttons: CURRENCY / COUNTRY CODES / U.S. STATES / SHAPE. The RANKED
  // switch controls rank mode. When on, CURRENCY, COUNTRY CODES, and SHAPE open
  // the rank-size picker (50/70/100/all); U.S. STATES goes straight to the map
  // and plays every state.
  $("#currencyBtn").addEventListener("click", () => {
    setSubject("currency");
    if ($("#rankModeInput").checked) {
      openRankPicker();
    } else {
      startGame();
    }
  });
  $("#codesBtn").addEventListener("click", () => {
    setSubject("codes");
    if ($("#rankModeInput").checked) {
      openRankPicker();
    } else {
      startGame();
    }
  });
  $("#statesBtn").addEventListener("click", () => {
    setSubject("states");
    if ($("#rankModeInput").checked) {
      pendingRankRounds = "all";
      startGame();
    } else {
      startGame();
    }
  });
  $("#shapeBtn").addEventListener("click", () => {
    setSubject("shape");
    if ($("#rankModeInput").checked) {
      openRankPicker();
    } else {
      startGame();
    }
  });

  // Shape mode typing box: live suggestions + keyboard picking.
  $("#shapeInput").addEventListener("input", renderShapeSuggest);
  $("#shapeInput").addEventListener("keydown", onShapeKeydown);
  $("#shapeInput").addEventListener("blur", () => {
    // Small delay so a mousedown on a suggestion (which uses preventDefault)
    // still wins before the box hides.
    setTimeout(() => {
      $("#shapeSuggest").classList.add("hidden");
      shapeMatches = [];
      shapeSelIndex = -1;
    }, 150);
  });

  // Mobile: keep the game screen inside the visible area when the on-screen
  // keyboard opens (the visual viewport shrinks). Without this, the keyboard
  // covers the typing box on iPad/phone.
  if (window.visualViewport) {
    const applyVisualViewport = () => {
      const gameScreen = $("#game");
      if (!gameScreen || gameScreen.classList.contains("hidden")) return;
      const vv = window.visualViewport;
      gameScreen.style.top = vv.offsetTop + "px";
      gameScreen.style.height = vv.height + "px";
      if (typeof resizeMap === "function") resizeMap();
      // Re-center the shape-mode country after the viewport shrinks.
      if (game && game.phase === "question" && game.subject === "shape") {
        zoomToCountry(game.questions[game.index].countries[0]);
      }
    };
    window.visualViewport.addEventListener("resize", applyVisualViewport);
    window.visualViewport.addEventListener("scroll", applyVisualViewport);
  }
  // The RANKED switch: toggling it re-syncs the locked settings via
  // applyRankMenuState() (which also recolors the play buttons via the
  // body.rank-active class).
  $("#rankModeInput").addEventListener("change", applyRankMenuState);

  // Rank picker controls (currency ranked rounds).
  document.querySelectorAll(".rank-opt").forEach(btn => {
    btn.addEventListener("click", () => startRankMode(btn.dataset.rounds));
  });
  $("#rankCloseBtn").addEventListener("click", () => closeOverlay("rankPicker"));
  $("#rankBackBtn").addEventListener("click", () => closeOverlay("rankPicker"));
  $("#rankPicker").addEventListener("click", e => {
    if (e.target === $("#rankPicker")) closeOverlay("rankPicker");   // click backdrop
  });

  // Settings overlay open/close/navigation.
  $("#settingsBtn").addEventListener("click", openSettings);
  $("#settingsCloseBtn").addEventListener("click", closeSettings);
  $("#settingsDoneBtn").addEventListener("click", closeSettings);
  $("#resetBtn").addEventListener("click", resetDefaults);

  // Replay: load a recorded run from a file.
  $("#replayBtn").addEventListener("click", () => $("#replayFileInput").click());
  $("#replayFileInput").addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    if (file) startReplay(file);
    e.target.value = "";
  });
  $("#downloadReplayBtn").addEventListener("click", downloadReplay);
  // Replay timeline scrubber: dragging jumps the replay to that time.
  $("#replaySeek").addEventListener("input", e => {
    if (replayPlay) replaySeekTo(parseFloat(e.target.value));
  });
  document.querySelectorAll(".cat-btn").forEach(btn => {
    btn.addEventListener("click", () => selectCategory(btn.dataset.cat));
  });
  $("#settingsOverlay").addEventListener("click", e => {
    if (e.target === $("#settingsOverlay")) closeSettings();   // click backdrop
  });
  window.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!$("#settingsOverlay").classList.contains("hidden")) closeSettings();
    else if (!$("#rankPicker").classList.contains("hidden")) closeOverlay("rankPicker");
  });
  // Interval Wait off => Interval Time disabled.
  $("#intervalToggleInput").addEventListener("change", syncIntervalState);

  // 📚 Exam mode toggle lives BOTH on the main menu and in Settings — toggling
  // either one syncs the other and re-applies the exam state.
  $("#examModeInput").addEventListener("change", () => setExamMode($("#examModeInput").checked));
  $("#menuExamModeInput").addEventListener("change", () => setExamMode($("#menuExamModeInput").checked));

  $("#playAgainBtn").addEventListener("click", startGame);
  $("#stopBtn").addEventListener("click", goToMenu);
  $("#mainMenuBtn").addEventListener("click", goToMenu);
  $("#detailsBtn").addEventListener("click", () => {
    $("#resultsDetails").classList.toggle("hidden");
  });
  $("#resetViewBtn").addEventListener("click", () => {
    if (zoomBehavior && svg) {
      svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity);
    }
  });

  // Click anywhere on the game screen during the interval wait to skip it.
  // Button clicks (Stop, Reset View, etc.) are ignored so they still work.
  // Capture phase runs before map handlers. When a skip actually happens we
  // stop propagation so the same click never registers as a map guess on the
  // freshly shown next round.
  document.addEventListener("click", e => {
    if (e.target && e.target.closest && e.target.closest("button")) return;
    if (skipInterval()) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // Secret cheat keybind (Shift + F → R → L). Only works on local pages
  // (file:// or localhost), never on the hosted website.
  if (isLocalFile) {
    window.addEventListener("keydown", e => {
      if (!e.shiftKey) { cheatKeys = ""; return; }
      const k = e.key.toLowerCase();
      const now = Date.now();
      // Reset if too much time between presses (2s for a relaxed combo).
      if (now - cheatLastKeyTime > 2000) cheatKeys = "";
      cheatLastKeyTime = now;
      cheatKeys += k;
      if (!cheatKeys.startsWith("f")) { cheatKeys = k === "f" ? "f" : ""; }
      if (cheatKeys === "frl") {
        cheatKeys = "";
        e.preventDefault();
        toggleCheatMode();
      }
    });
  }
});
