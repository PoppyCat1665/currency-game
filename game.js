/* global d3, topojson, WORLD_TOPOJSON, CURRENCIES */

"use strict";

// ================= DOM Helpers =================
function $(id) { return document.getElementById(String(id).replace(/^#/, "")); }

const SCREENS = ["menu", "game", "results"];

function showScreen(name) {
  SCREENS.forEach(id => $(id).classList.toggle("hidden", id !== name));
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

// Every click — whether it lands directly on a country or on the ocean —
// runs the radius-based resolution first. The circle (click radius around the
// finger) takes priority over the exact country under the cursor, so if the
// correct answer country is anywhere inside the radius it counts as correct.
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
    const pts = countryBoundaries[i];
    if (!pts || pts.length === 0) continue;
    let minKm = Infinity;
    for (let j = 0; j < pts.length; j++) {
      const km = haversineKm(geo, pts[j]);
      if (km < minKm) minKm = km;
    }
    if (minKm <= radiusKm) candidates.push({ id: countryFeatures[i].id, km: minKm });
    if (minKm < nearestKm) {
      nearestKm = minKm;
      nearest = countryFeatures[i];
    }
  }

  // Any country inside the radius counts as a hit, so if the correct answer is
  // among the candidates, accept it (pick the nearest correct one). Otherwise
  // fall back to the nearest country so a wrong guess is still marked.
  if (nearest) {
    const q = game.questions[game.index];
    const correctSet = new Set(q.countries);
    let chosenId = nearest.id;
    let nearestCorrectKm = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      if (correctSet.has(candidates[i].id) && candidates[i].km < nearestCorrectKm) {
        nearestCorrectKm = candidates[i].km;
        chosenId = candidates[i].id;
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

function updateScoreDisplay() {
  $("#score").textContent = game.score;
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
function startGame() {
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
  const snapRadiusKm = rankMode ? 10 : Math.max(0, parseFloat($("#snapRadiusInput").value) || 1000);

  // Read display & sound preferences for this session
  const showFullName = $("#showFullNameInput").checked;
  const showCountryNames = $("#showCountryNamesInput").checked;
  soundsEnabled = $("#soundInput").checked;

  // Browsers block audio until a user gesture; Start click counts as one.
  ensureAudio();

  const questions = shuffle(CURRENCIES.map(c => ({ ...c })));

  game = {
    questions,
    total: questions.length,
    index: 0,
    score: 0,
    correct: 0,
    incorrect: 0,
    guessMs: guessSec * 1000,
    intervalMs: intervalSec * 1000,
    maxGuesses,
    snapRadiusKm,
    showFullName,
    showCountryNames,
    rankMode,
    playerName,
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

  $("#guessBar").classList.remove("low");
  startGuessTimer();
}

function resolveQuestion(clickedId) {
  if (!game || game.phase !== "question") return;

  const q = game.questions[game.index];

  // ---------- Time's up: fail the question ----------
  if (clickedId === null) {
    game.incorrect++;
    finishQuestion(q);
    showFeedback("info", `⏰ Time's up! ${q.name} is used in: ${answerLabelFor(q)}`);
    playSound("timeout");
    updateScoreDisplay();
    return;
  }

  // ---------- Correct guess: score and advance ----------
  if (q.countries.includes(clickedId)) {
    game.correct++;
    game.score++;
    const shown = nameOf(clickedId);
    finishQuestion(q);
    showFeedback("ok", `✅ Correct! ${q.name} → ${shown}`);
    playSound("correct");
    updateScoreDisplay();
    return;
  }

  // ---------- Wrong guess ----------
  markCountries([clickedId], "wrong");
  markCircles([clickedId], "wrong");
  playSound("wrong");

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

// ================= Results =================
function showResults() {
  game.phase = "done";

  $("#finalScore").textContent = game.score;
  $("#finalCorrect").textContent = game.correct;
  $("#finalIncorrect").textContent = game.incorrect;
  $("#finalAccuracy").textContent = Math.round((game.correct / game.total) * 100) + "%";
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

  showScreen("results");
}

// ================= Error reporting (visible on screen) =================
window.addEventListener("error", ev => {
  const div = document.createElement("div");
  div.textContent = "⚠ " + ev.message + "\n" + (ev.error && ev.error.stack ? ev.error.stack : "");
  div.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:99999;background:#7f1d1d;color:#fff;padding:8px 14px;border-radius:8px;font:11px monospace;max-width:90vw;white-space:pre-wrap;";
  document.body.appendChild(div);
});

// ================= Wire up UI =================
document.addEventListener("DOMContentLoaded", () => {
  initMap();

  $("#startBtn").addEventListener("click", startGame);
  $("#playAgainBtn").addEventListener("click", startGame);
  $("#stopBtn").addEventListener("click", () => {
    if (game) { clearTimer(game.guessTimerId); clearTimer(game.intervalTimerId); clearTimer(game.countdownTimerId); }
    stopTotalTimer();
    $("#countdownOverlay").classList.add("hidden");
    if (zoomBehavior && svg) {
      svg.call(zoomBehavior.transform, d3.zoomIdentity);
    }
    showScreen("menu");
  });
  $("#mainMenuBtn").addEventListener("click", () => {
    if (game) { clearTimer(game.guessTimerId); clearTimer(game.intervalTimerId); clearTimer(game.countdownTimerId); }
    stopTotalTimer();
    $("#countdownOverlay").classList.add("hidden");
    if (zoomBehavior && svg) {
      svg.call(zoomBehavior.transform, d3.zoomIdentity);
    }
    showScreen("menu");
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
});