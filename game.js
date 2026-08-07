/* global d3, topojson, WORLD_TOPOJSON, CURRENCIES, EXAM_CURRENCIES, COUNTRY_CONTINENT */

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
// Only works when the game is opened as a LOCAL FILE (file://) — never on the
// hosted website. When enabled, the correct country is circled automatically
// on every new question for easy development/testing.
let cheatMode = false;
let cheatKeys = "";           // tracks the F-R-L sequence while Shift is held
let cheatLastKeyTime = 0;
const isLocalFile = typeof location !== "undefined" && location.protocol === "file:";

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
    showToast("🛠 CHEAT MODE ON — correct country circled", true);
    // Ring the current question right away.
    if (game && game.phase === "question") ringCorrectForDev();
  } else {
    showToast("🛠 CHEAT MODE OFF", false);
  }
}

// Draws the green ring + fill on the current question's correct country.
function ringCorrectForDev() {
  if (!game || !cheatMode) return;
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

// localStorage key for persisting all settings.
const SETTINGS_KEY = "currencyGameSettings_v1";

function buildCountryBoundaries() {
  countryBoundaries = countryFeatures.map(f => {
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

  projection = d3.geoNaturalEarth1();
  path = d3.geoPath(projection);

  zoomBehavior = d3.zoom()
    .scaleExtent([1, 12])
    .clickDistance(5)
    .on("zoom", ev => scheduleZoom(ev.transform));

  svg.call(zoomBehavior)
     .on("dblclick.zoom", null); // disable double-click zoom

  // Reference for diagnostics/testing; harmless.
  svg.node().__zoomBehavior = zoomBehavior;

  // Pen / touch tap detection. d3-zoom's drag handling can swallow taps from
  // an Apple Pencil or finger, making it pan instead of selecting. We detect a
  // quick, non-dragging pointer lift and resolve it as a country selection.
  // Mouse still uses the normal click handlers below.
  let tapState = null;
  svg.on("pointerdown", ev => {
    if (ev.pointerType === "mouse") { tapState = null; return; }
    tapState = { x: ev.clientX, y: ev.clientY, t: performance.now(), moved: false };
  });
  svg.on("pointermove", ev => {
    if (!tapState) return;
    if (Math.hypot(ev.clientX - tapState.x, ev.clientY - tapState.y) > 8) tapState.moved = true;
  });
  svg.on("pointerup", ev => {
    if (!tapState) return;
    const s = tapState;
    tapState = null;
    const isTap = !s.moved && (performance.now() - s.t) < 500;
    if (isTap && game && game.phase === "question" && game.tapSelect) {
      resolveQuestionByRadius(ev);
    }
  });
  svg.on("pointercancel", () => { tapState = null; });

  mapG = svg.append("g");

  // Ocean click-catcher under the countries: catches clicks near tiny nations.
  mapG.append("path")
      .attr("class", "ocean")
      .attr("d", path({ type: "Sphere" }))
      .on("click", resolveQuestionByRadius);

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

  // Sphere + graticule
  mapG.append("path")
      .attr("class", "sphere")
      .attr("pointer-events", "none");
  mapG.append("path")
      .attr("class", "graticule")
      .attr("pointer-events", "none");

  // Countries
  const topo = WORLD_TOPOJSON;
  const features = topojson.feature(topo, topo.objects.countries).features;

  features.forEach(f => {
    if (f.id === undefined || f.id === null) return;
    const numId = Number(f.id);
    if (Number.isNaN(numId)) return;
    f.id = numId;
    countryById.set(numId, f.properties.name);
  });

  countryFeatures = features.filter(f => Number.isInteger(f.id));

  mapG.selectAll("path.country")
      .data(countryFeatures, d => d.id)
      .join("path")
      .attr("class", "country")
      .attr("data-id", d => d.id)
      .attr("pointer-events", "visible")
      .on("click", onCountryClick)
      .on("mousemove", ev => moveTooltip(ev))
      .on("mouseover", (ev, d) => showTooltip(ev, d.properties.name))
      .on("mouseout", hideTooltip);

  // The highlight group was created before the countries were appended to
  // mapG, so it ended up underneath them. Re-append it last so answer rings
  // always render on top of the world map.
  highlightG.raise();

  buildCountryBoundaries();

  // Build the sorted country list used by the Country toggle in settings.
  countryList = countryFeatures
    .map(f => ({ id: f.id, name: f.properties.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  window.addEventListener("resize", debounce(resizeMap, 150));

  resizeMap();

  $("#mapLoading").classList.add("hidden");
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

  projection.fitSize([width, height], { type: "Sphere" });
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
  });
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
  if (game && game.phase === "question") {
    resolveQuestionByRadius(event);
  }
}

// Clicking the ocean (transparent layer under countries) snaps to the nearest
// country when the click is within the configurable nearby area. The radius is
// set in the menu in kilometers, so tiny countries are easy to hit even when
// their visible shape is a few pixels on screen.

function resolveQuestionByRadius(event) {
  if (!game || game.phase !== "question") return;

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
      .classed("wrong", false);
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
function skipInterval() {
  if (!game || game.phase !== "answered") return false;
  const isFinal = game.index === game.total - 1;
  advanceInterval(isFinal);
  return true;
}

function startInterval(isFinal) {
  clearTimer(game.intervalTimerId);
  $("#intervalSection").classList.remove("hidden");
  $("#intervalLabel").textContent = isFinal ? "🎉 Showing results" : "➡ Next question";

  const dur = game.intervalMs;
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

  if (dur <= 0) {
    advanceInterval(isFinal);
    return;
  }

  $("#intervalLeft").textContent = (dur / 1000).toFixed(1) + "s";
  $("#intervalBar").style.width = "0%";
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
}

function startGame() {
  // Completely reset the map screen before anything from the previous game.
  resetGameScreen();

  // stop any running timers
  stopTotalTimer();
  if (game) { clearTimer(game.guessTimerId); clearTimer(game.intervalTimerId); clearTimer(game.countdownTimerId); }

  const rankMode = $("#rankModeInput").checked;
  const playerName = $("#playerNameInput").value.trim();

  // Rank mode forces hard settings.
  const guessSec = rankMode ? 5 : Math.max(1, parseInt($("#guessTimeInput").value, 10) || 7);
  const intervalEnabled = rankMode ? false : $("#intervalToggleInput").checked;
  const intervalSec = intervalEnabled
    ? Math.max(0, parseInt($("#intervalTimeInput").value, 10) || 3)
    : 0; // interval off -> skip straight to the next round
  const maxGuesses = rankMode ? 1 : Math.max(1, parseInt($("#maxGuessesInput").value, 10) || 1);
  const snapRadiusKm = rankMode ? 250 : Math.max(0, parseFloat($("#snapRadiusInput").value) || 1000);

  // Read display & sound preferences for this session
  const showFullName = $("#showFullNameInput").checked;
  const showCountryNames = $("#showCountryNamesInput").checked;
  const tapSelect = $("#tapSelectInput").checked;
  soundsEnabled = $("#soundInput").checked;

  // 📚 Exam mode: ON = only the classic study list.
  // OFF = every currency in data.js is a playable target (currently covers
  // all countries on the map with real currencies). Works in both casual and
  // ranked play.
  const examMode = $("#examModeInput").checked;

  // Browsers block audio until a user gesture; Start click counts as one.
  ensureAudio();

  // Build the question pool from the real currency data. In 📚 Exam mode,
  // restrict to ONLY the classic study list (EXAM_CURRENCIES). Otherwise use
  // every currency in data.js.
  // Number of rounds: clamp to 1 .. number of available questions. The menu
  // sets the default (EXAM_COUNT in 📚 mode, 40 in normal mode); max = the
  // size of the active pool.
  let questions = CURRENCIES.map(c => ({ ...c }));
  if (examMode) {
    const examSet = new Set(EXAM_CURRENCIES);
    questions = questions.filter(c => examSet.has(c.code));
  }
  // Country toggle: only in casual (not ranked, not exam). Restrict to
  // currencies used by the toggled-on countries, if any are unselected.
  if (!rankMode && !examMode && selectedCountries.size > 0 && selectedCountries.size < countryList.length) {
    questions = questions.filter(q => q.countries.some(id => selectedCountries.has(id)));
  }
  questions = shuffle(questions);
  // Rounds: if ranked WITH Exam mode on, just use the full exam list
  // (EXAM_COUNT rounds). Otherwise ranked uses the chosen rank mode
  // (50/70/100/all); casual uses the Rounds setting.
  const roundsRequested = rankMode
    ? (examMode ? questions.length : (pendingRankRounds === "all" ? questions.length : pendingRankRounds))
    : Math.max(1, parseInt($("#roundsInput").value, 10) || (examMode ? EXAM_COUNT : 40));
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

  if (rankMode) {
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
}

function showQuestion() {
  const q = game.questions[game.index];
  game.phase = "question";
  game.guessesLeft = game.maxGuesses;
  updateGuessesDisplay();

  // Clear answer circle markers from the previous question.
  highlightG.selectAll("g.hl").remove();

  $("#currencyBox").classList.toggle("code-only", !game.showFullName);
  if (game.showFullName) {
    $("#currencyName").textContent = q.name;
  } else {
    $("#currencyName").textContent = q.code;
  }
  $("#currencySymbol").textContent = q.symbol ? `${q.symbol}   ·   ${q.code}` : q.code;
  $("#progress").textContent = `${game.index + 1} / ${game.total}`;

  resetCountryClasses();
  hideFeedback();

  // Cheat mode (local only): auto-circle the correct country for dev.
  if (cheatMode && isLocalFile) ringCorrectForDev();

  $("#guessBar").classList.remove("low");
  startGuessTimer();
}

// Streak bonus points per milestone (10, 20, 30, ...). Each additional
// 10-streak block past 30 gives +500.
function streakBonusFor(n) {
  if (n < 10) return 0;
  if (n < 20) return 100;
  if (n < 30) return 250;
  return 500;
}

function resolveQuestion(clickedId) {
  if (!game || game.phase !== "question") return;

  const q = game.questions[game.index];

  // ---------- Time's up: fail the question ----------
  if (clickedId === null) {
    game.incorrect++;
    // Rank: streak resets, no points.
    if (game.rankMode) {
      game.streak = 0;
      updateStreakPill();
      $("#streakCount").textContent = 0;
    }
    finishQuestion(q);
    showFeedback("info", `⏰ Time's up! ${q.name} is used in: ${answerLabelFor(q)}`);
    playSound("timeout");
    updateScoreDisplay();
    return;
  }

  // ---------- Correct guess ----------
  if (q.countries.includes(clickedId)) {
    game.correct++;
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
      showFeedback("ok", `✅ Correct! ${q.name} → ${shown} (+${speedBonus} speed)`);
      playSound("correct");
    } else {
      // Casual: +1 point per correct answer as before.
      game.score++;
      showScorePop("+1", "good-pop");
      showFeedback("ok", `✅ Correct! ${q.name} → ${shown}`);
      playSound("correct");
    }

    finishQuestion(q);
    updateScoreDisplay();
    return;
  }

  // ---------- Wrong guess ----------
  markCountries([clickedId], "wrong");
  markCircles([clickedId], "wrong");
  playSound("wrong");

  if (game.rankMode) {
    // Rank: a wrong guess resets the streak.
    game.streak = 0;
    $("#streakCount").textContent = 0;
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
    showFeedback("no", `❌ Out of guesses! ${q.name} is used in: ${answerLabelFor(q)}`);
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

  // Always reveal the full currency name once the answer is in.
  $("#currencyBox").classList.remove("code-only");
  $("#currencyName").textContent = q.name;

  const isFinal = game.index === game.total - 1;

  if (isFinal) {
    stopTotalTimer();
    game.totalElapsed = performance.now() - game.totalStart;
    playSound("finish");
    startInterval(true);
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

  showScreen("results");
}

// ================= Error reporting (visible on screen) =================
window.addEventListener("error", ev => {
  const div = document.createElement("div");
  div.textContent = "⚠ " + ev.message + "\n" + (ev.error && ev.error.stack ? ev.error.stack : "");
  div.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:99999;background:#7f1d1d;color:#fff;padding:8px 14px;border-radius:8px;font:11px monospace;max-width:90vw;white-space:pre-wrap;";
  document.body.appendChild(div);
});

// ================= Rank mode menu toggle =================
// When rank mode is switched ON the menu settings visibly change to the
// forced hard values (5s, interval off, 1 guess, 250 km radius) and the whole
// menu turns red. Switching OFF restores the user's previous inputs.
const RANK_BODY_CLASS = "rank-active";

// Sizes of the two question pools, used to bound the Rounds input.
const EXAM_LIST = new Set(EXAM_CURRENCIES);
const EXAM_COUNT = CURRENCIES.filter(c => EXAM_LIST.has(c.code)).length;
const FULL_COUNT = CURRENCIES.length;

// Bound the Rounds input to the size of the active pool: EXAM_COUNT in 📚
// mode, FULL_COUNT otherwise. Never lets the user request more than exists.
function syncRoundsMax() {
  const roundsEl = $("#roundsInput");
  roundsEl.max = $("#examModeInput").checked ? EXAM_COUNT : FULL_COUNT;
  const v = parseInt(roundsEl.value, 10);
  if (Number.isFinite(v) && v > roundsEl.max) roundsEl.value = roundsEl.max;
}

function applyRankMenuState() {
  const ranked = $("#rankModeInput").checked;
  const guess = $("#guessTimeInput");
  const intervalToggle = $("#intervalToggleInput");
  const intervalTime = $("#intervalTimeInput");
  const guesses = $("#maxGuessesInput");
  const radius = $("#snapRadiusInput");
  const roundsInput = $("#roundsInput");
  const fullName = $("#showFullNameInput");
  const countryNames = $("#showCountryNamesInput");
  const examMode = $("#examModeInput");
  const nameInput = $("#playerNameInput");

  // Locked in rank mode: difficulty numbers/toggles + display toggles.
  // 📚 Exam mode stays unlocked so it can be toggled during ranked play.
  const settingsToLock = [
    "guessTimeInput",
    "intervalToggleInput",
    "intervalTimeInput",
    "maxGuessesInput",
    "snapRadiusInput",
    "roundsInput",
    "showFullNameInput",
    "showCountryNamesInput"
  ];

  if (ranked) {
    // Store the user's casual values the first time they switch on, so we can
    // restore them when rank mode is turned off.
    if (guess.dataset.pref === undefined) {
      guess.dataset.pref = guess.value;
      guesses.dataset.pref = guesses.value;
      radius.dataset.pref = radius.value;
      intervalToggle.dataset.pref = intervalToggle.checked ? "1" : "0";
      intervalTime.dataset.pref = intervalTime.value;
      roundsInput.dataset.pref = roundsInput.value;
      fullName.dataset.pref = fullName.checked ? "1" : "0";
      countryNames.dataset.pref = countryNames.checked ? "1" : "0";
      examMode.dataset.pref = examMode.checked ? "1" : "0";
    }
    // Force rank values. 📚 Exam mode is left as-is (togglable).
    guess.value = 5;
    guesses.value = 1;
    radius.value = 250;
    roundsInput.value = examMode.checked ? EXAM_COUNT : 55; // 55 rounds, or the exam list size if 📚 on
    intervalToggle.checked = false;
    intervalTime.disabled = true;
    intervalTime.value = 0;
    fullName.checked = false;        // rank hides full currency names
    countryNames.checked = false;    // rank hides country names (harder)
    nameInput.placeholder = "Your name… (shown in rank mode)";
    // Lock every option input so the player can't change them mid-rank.
    settingsToLock.forEach(id => {
      const el = document.getElementById(id);
      el.disabled = true;
      el.classList.add("locked");
    });
  } else {
    if (guess.dataset.pref !== undefined) {
      guess.value = guess.dataset.pref;
      guesses.value = guesses.dataset.pref;
      radius.value = radius.dataset.pref;
      intervalToggle.checked = intervalToggle.dataset.pref === "1";
      intervalTime.disabled = false;
      intervalTime.value = intervalTime.dataset.pref;
      roundsInput.value = roundsInput.dataset.pref;
      fullName.checked = fullName.dataset.pref === "1";
      countryNames.checked = countryNames.dataset.pref === "1";
      examMode.checked = examMode.dataset.pref === "1";
    }
    nameInput.placeholder = "Your name…";
    // Re-enable every option input.
    settingsToLock.forEach(id => {
      const el = document.getElementById(id);
      el.disabled = false;
      el.classList.remove("locked");
    });
  }

  document.body.classList.toggle(RANK_BODY_CLASS, ranked);
  syncRoundsMax();
  syncIntervalState();
}

// ================= Settings overlay (categorized) =================
// Interval Time is visually disabled whenever Interval Wait is off.
function syncIntervalState() {
  const on = $("#intervalToggleInput").checked;
  const t = $("#intervalTimeInput");
  t.disabled = !on;
  t.classList.toggle("locked", !on);
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
      snapRadius: $("#snapRadiusInput").value,
      rounds: $("#roundsInput").value,
      showFullName: $("#showFullNameInput").checked,
      showCountryNames: $("#showCountryNamesInput").checked,
      tapSelect: $("#tapSelectInput").checked,
      sound: $("#soundInput").checked,
      examMode: $("#examModeInput").checked,
      playerName: $("#playerNameInput").value,
      countries: [...selectedCountries]
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
    if (d.snapRadius !== undefined) $("#snapRadiusInput").value = d.snapRadius;
    if (d.rounds !== undefined) $("#roundsInput").value = d.rounds;
    if (d.showFullName !== undefined) $("#showFullNameInput").checked = !!d.showFullName;
    if (d.showCountryNames !== undefined) $("#showCountryNamesInput").checked = !!d.showCountryNames;
    if (d.tapSelect !== undefined) $("#tapSelectInput").checked = !!d.tapSelect;
    if (d.sound !== undefined) $("#soundInput").checked = !!d.sound;
    if (d.examMode !== undefined) $("#examModeInput").checked = !!d.examMode;
    if (d.playerName !== undefined) $("#playerNameInput").value = d.playerName;
    if (Array.isArray(d.countries)) {
      selectedCountries.clear();
      d.countries.forEach(id => selectedCountries.add(Number(id)));
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

// Build one toggle row for a country.
function makeCountryRow(c) {
  const label = document.createElement("label");
  label.className = "country-toggle";
  label.dataset.name = c.name.toLowerCase();
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = selectedCountries.has(c.id);
  cb.dataset.id = c.id;
  cb.addEventListener("change", () => {
    if (cb.checked) selectedCountries.add(c.id);
    else selectedCountries.delete(c.id);
    saveSettings();
    updateContinentCounts();
  });
  const span = document.createElement("span");
  span.textContent = c.name;
  label.appendChild(cb);
  label.appendChild(span);
  return label;
}

// Toggle every country inside a continent heading on/off.
function toggleContinent(head) {
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
    const id = Number(cb.dataset.id);
    if (cb.checked) selectedCountries.add(id);
    else selectedCountries.delete(id);
  });
  saveSettings();
  updateContinentCounts();
}

// Refresh each continent heading's checkbox + "selected / total" badge.
function updateContinentCounts() {
  document.querySelectorAll(".country-continent").forEach(head => {
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

function renderCountryList() {
  const container = $("#countryList");
  if (!container) return;
  container.innerHTML = "";

  // Group countries by continent (from COUNTRY_CONTINENT), keeping name order.
  const groups = {};
  countryList.forEach(c => {
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
    check.addEventListener("change", () => toggleContinent(head));
    const name = document.createElement("span");
    name.textContent = cont;
    const badge = document.createElement("span");
    badge.className = "cont-count";
    head.appendChild(check);
    head.appendChild(name);
    head.appendChild(badge);
    container.appendChild(head);
    groups[cont].forEach(c => container.appendChild(makeCountryRow(c)));
    delete groups[cont];
  };

  CONTINENT_ORDER.forEach(cont => {
    if (groups[cont] && groups[cont].length) appendHeading(cont);
  });
  // Any ungrouped fall into "Other" at the end.
  if (groups.Other && groups.Other.length) appendHeading("Other");

  updateContinentCounts();
}

function setAllCountries(on) {
  selectedCountries.clear();
  if (on) countryList.forEach(c => selectedCountries.add(c.id));
  document.querySelectorAll(".country-toggle input").forEach(cb => { cb.checked = on; });
  saveSettings();
  updateContinentCounts();
}

// When 📚 Exam mode is ON, the Country toggle is ignored and disabled.
function syncCountriesState() {
  const disabled = $("#examModeInput").checked;
  document.querySelectorAll("#countryList input").forEach(cb => { cb.disabled = disabled; });
  $("#countrySearch").disabled = disabled;
  $("#countryAllBtn").disabled = disabled;
  $("#countryNoneBtn").disabled = disabled;
  $("#countriesDisabledNote").classList.toggle("hidden", !disabled);
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

// Rank mode picker: choose how many rounds the ranked game plays.
// "all" = every available currency (respects Exam mode), otherwise a fixed count.
let pendingRankRounds = 50;        // default rank mode

function openRankPicker() {
  // With Exam mode on, there's no rank-size choice: play the full exam list
  // (EXAM_COUNT rounds) directly, without showing the picker.
  if ($("#examModeInput").checked) {
    startRankMode("all");
    return;
  }
  const poolTotal = FULL_COUNT;
  $("#rankAllCount").textContent = poolTotal;
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
function resetDefaults() {
  $("#guessTimeInput").value = 7;
  $("#intervalToggleInput").checked = true;
  $("#intervalTimeInput").value = 3;
  $("#maxGuessesInput").value = 1;
  $("#snapRadiusInput").value = 1000;
  $("#roundsInput").value = 40;
  $("#showFullNameInput").checked = true;
  $("#showCountryNamesInput").checked = true;
  $("#soundInput").checked = true;
  $("#examModeInput").checked = false;
  $("#playerNameInput").value = "";
  setAllCountries(true);   // reset country toggles to all-on
  syncRoundsMax();
  syncIntervalState();
  saveSettings();
}

// Return to the main menu, always in the normal (non-rank) state.
function goToMenu() {
  if (game) { clearTimer(game.guessTimerId); clearTimer(game.intervalTimerId); clearTimer(game.countdownTimerId); }
  stopTotalTimer();
  $("#countdownOverlay").classList.add("hidden");
  if (zoomBehavior && svg) {
    svg.call(zoomBehavior.transform, d3.zoomIdentity);
  }
  $("#rankModeInput").checked = false;
  applyRankMenuState();
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
    s.style.animationDuration = (14 + Math.random() * 18) + "s";
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

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.min(90, Math.round((W * H) / 18000));
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
    ctx.clearRect(0, 0, W, H);
    const c = document.body.classList.contains("rank-active") ? "248,113,113" : "76,201,240";
    for (const p of P) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + c + ",0.55)";
      ctx.fill();
    }
    ctx.lineWidth = 0.6;
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 14400) { // 120px²
          const a = 1 - Math.sqrt(d2) / 120;
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
    start() {}, stop() {}
  } : {
    start() {
      if (raf !== null || !canvas) return;
      resize();
      raf = requestAnimationFrame(step);
    },
    stop() {
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
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

// ================= Wire up UI =================
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initInfoTips();
  initMenuBackground();

  // Restore persisted settings (needs countryList built by initMap), then
  // render the country toggles and apply menu state.
  loadSettings();
  initSelectedCountries();
  renderCountryList();
  applyRankMenuState();
  syncRoundsMax();
  syncIntervalState();
  $("#rankModeInput").addEventListener("change", applyRankMenuState);

  // Save any changed casual setting as soon as it changes.
  [
    "guessTimeInput", "intervalToggleInput", "intervalTimeInput",
    "maxGuessesInput", "snapRadiusInput", "roundsInput",
    "showFullNameInput", "showCountryNamesInput", "tapSelectInput", "soundInput",
    "examModeInput", "playerNameInput"
  ].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("change", saveSettings);
  });

  // Country toggle controls.
  $("#countrySearch").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".country-toggle").forEach(row => {
      row.style.display = row.dataset.name.includes(q) ? "" : "none";
    });
    // Hide continent headings that have no visible countries.
    document.querySelectorAll(".country-continent").forEach(head => {
      let visible = 0;
      let el = head.nextElementSibling;
      while (el && !el.classList.contains("country-continent")) {
        if (el.style.display !== "none") visible++;
        el = el.nextElementSibling;
      }
      head.style.display = visible ? "" : "none";
    });
  });
  $("#countryAllBtn").addEventListener("click", () => setAllCountries(true));
  $("#countryNoneBtn").addEventListener("click", () => setAllCountries(false));
  // Clicking a continent heading toggles every country in it. Clicking the
  // heading's own checkbox is handled by its change event, so ignore it here
  // to avoid toggling twice.
  document.addEventListener("click", e => {
    const head = e.target.closest && e.target.closest(".country-continent");
    if (head && !e.target.closest(".cont-check")) {
      e.preventDefault();
      toggleContinent(head);
    }
  });
  // Exam mode disables the country toggle.
  syncCountriesState();
  $("#examModeInput").addEventListener("change", syncCountriesState);

  // Mode buttons: PLAY = casual, RANKED = rank mode.
  $("#playBtn").addEventListener("click", () => {
    $("#rankModeInput").checked = false;
    applyRankMenuState();
    startGame();
  });
  $("#rankedBtn").addEventListener("click", openRankPicker);

  // Rank picker controls.
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

  // Switching 📚 Exam mode adjusts the rounds default and max: EXAM_COUNT in
  // 📚 mode, 40 default / FULL_COUNT max in casual. In ranked play (exam stays
  // togglable) it updates the rounds to the exam list size as well.
  $("#examModeInput").addEventListener("change", () => {
    const roundsEl = $("#roundsInput");
    if (roundsEl.dataset.pref === undefined) {
      roundsEl.dataset.pref = roundsEl.value;
    }
    const ranked = $("#rankModeInput").checked;
    roundsEl.value = $("#examModeInput").checked
      ? EXAM_COUNT
      : (ranked ? 55 : 40);
    syncRoundsMax();
  });

  $("#playAgainBtn").addEventListener("click", startGame);
  $("#stopBtn").addEventListener("click", goToMenu);
  $("#mainMenuBtn").addEventListener("click", goToMenu);
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

  // Secret cheat keybind (Shift + F → R → L). Only works on LOCAL file://,
  // never on the hosted website.
  if (isLocalFile) {
    window.addEventListener("keydown", e => {
      if (!e.shiftKey) { cheatKeys = ""; return; }
      const k = e.key.toLowerCase();
      const now = Date.now();
      // Reset if too much time between presses.
      if (now - cheatLastKeyTime > 1500) cheatKeys = "";
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
