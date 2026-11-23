// easeviz — page wiring. All the easing math lives in easing.js; this file
// only touches the DOM: the curve editor, the previews, the race, the code.
(function () {
  "use strict";

  var E = window.Easeviz;

  // --- state ---------------------------------------------------------------
  var state = {
    preset: E.presetById("ease-out-cubic"), // current curve (bezier or keyframes)
    customBezier: null, // set when the user drags or pastes — a bezier preset
    duration: 600, // ms
    delay: 0, // ms
    loop: true,
    reverse: false,
    compareId: "ease",
    codeTab: "css",
  };

  function currentPreset() {
    return state.customBezier || state.preset;
  }

  // --- tiny DOM helpers ------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function on(id, ev, fn) { $(id).addEventListener(ev, fn); }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function copyText(text, btn) {
    function done() {
      var original = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = original; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
    } else {
      legacyCopy(text, done);
    }
  }
  function legacyCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (err) { /* clipboard unavailable */ }
    document.body.removeChild(ta);
    done();
  }

  // --- curve editor ----------------------------------------------------------
  // Plot area inside the 300x300 SVG. Value -0.6 sits at the bottom,
  // value 1.6 at the top, so overshoot curves (back easings) stay visible.
  var PLOT = { x0: 24, x1: 276, yTop: 24, yBot: 276, vMin: -0.6, vMax: 1.6 };
  var NS = "http://www.w3.org/2000/svg";

  function px(v) { return PLOT.x0 + v * (PLOT.x1 - PLOT.x0); }
  function py(v) {
    return PLOT.yBot - ((v - PLOT.vMin) / (PLOT.vMax - PLOT.vMin)) * (PLOT.yBot - PLOT.yTop);
  }
  function fromPx(x) { return (x - PLOT.x0) / (PLOT.x1 - PLOT.x0); }
  function fromPy(y) {
    return PLOT.vMin + ((PLOT.yBot - y) / (PLOT.yBot - PLOT.yTop)) * (PLOT.vMax - PLOT.vMin);
  }

  var svg = $("curveSvg");
  var curvePath = $("curvePath");
  var guide1 = $("guide1");
  var guide2 = $("guide2");
  var handle1 = $("handle1");
  var handle2 = $("handle2");

  function buildGrid() {
    // Vertical + horizontal gridlines, drawn once.
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      var line = document.createElementNS(NS, "line");
      line.setAttribute("x1", px(t)); line.setAttribute("y1", PLOT.yTop);
      line.setAttribute("x2", px(t)); line.setAttribute("y2", PLOT.yBot);
      line.setAttribute("class", "grid-line");
      svg.insertBefore(line, svg.firstChild);
    });
    [-0.5, 0, 0.5, 1, 1.5].forEach(function (v) {
      var line = document.createElementNS(NS, "line");
      line.setAttribute("x1", PLOT.x0); line.setAttribute("y1", py(v));
      line.setAttribute("x2", PLOT.x1); line.setAttribute("y2", py(v));
      line.setAttribute("class", v === 0 || v === 1 ? "axis-line" : "grid-line");
      svg.insertBefore(line, svg.firstChild);
    });
    var ref = document.createElementNS(NS, "line");
    ref.setAttribute("x1", px(0)); ref.setAttribute("y1", py(0));
    ref.setAttribute("x2", px(1)); ref.setAttribute("y2", py(1));
    ref.setAttribute("class", "ref-line");
    svg.insertBefore(ref, svg.firstChild);
  }

  function pathFromPoints(pts) {
    return pts
      .map(function (p, i) {
        return (i === 0 ? "M " : "L ") + px(p[0]).toFixed(1) + " " + py(p[1]).toFixed(1);
      })
      .join(" ");
  }

  function drawEditor() {
    var preset = currentPreset();
    var pts = E.curvePoints(preset, 64);
    curvePath.setAttribute("d", pathFromPoints(pts));

    var isBezier = !!preset.bezier;
    [handle1, handle2, guide1, guide2].forEach(function (el) {
      el.style.display = isBezier ? "" : "none";
    });

    var note = $("editorNote");
    if (isBezier) {
      var b = preset.bezier;
      handle1.setAttribute("cx", px(b[0]));
      handle1.setAttribute("cy", py(b[1]));
      handle2.setAttribute("cx", px(b[2]));
      handle2.setAttribute("cy", py(b[3]));
      guide1.setAttribute("x1", px(0)); guide1.setAttribute("y1", py(0));
      guide1.setAttribute("x2", px(b[0])); guide1.setAttribute("y2", py(b[1]));
      guide2.setAttribute("x1", px(1)); guide2.setAttribute("y1", py(1));
      guide2.setAttribute("x2", px(b[2])); guide2.setAttribute("y2", py(b[3]));
      handle1.setAttribute("aria-valuetext", "x " + b[0].toFixed(2) + ", y " + b[1].toFixed(2));
      handle2.setAttribute("aria-valuetext", "x " + b[2].toFixed(2) + ", y " + b[3].toFixed(2));
      note.textContent = "Drag the dots, use the arrow keys, or type numbers below. x stays between 0 and 1; y can overshoot.";
      note.classList.remove("locked");
    } else {
      note.textContent = "Bounce and elastic need keyframes — no single bezier can draw this curve, so the handles are off. The code tab has the @keyframes.";
      note.classList.add("locked");
    }

    $("numX1").value = isBezier ? E.formatNumber(preset.bezier[0]) : "—";
    $("numY1").value = isBezier ? E.formatNumber(preset.bezier[1]) : "—";
    $("numX2").value = isBezier ? E.formatNumber(preset.bezier[2]) : "—";
    $("numY2").value = isBezier ? E.formatNumber(preset.bezier[3]) : "—";
    [$("numX1"), $("numY1"), $("numX2"), $("numY2")].forEach(function (input) {
      input.disabled = !isBezier;
    });

    $("presetName").textContent = preset.name;
    $("presetBlurb").textContent = preset.blurb;
    updateCode();
  }

  function setCustomBezier(b) {
    state.customBezier = {
      id: "custom",
      name: "Custom — " + E.formatBezier(b),
      bezier: b,
      blurb: "Your own curve. Copy it from the code tab before you lose it.",
    };
    state.preset = state.customBezier;
    markActivePreset("custom");
    drawEditor();
  }

  // Dragging: pointer events on the handles, coordinates via the SVG box.
  function svgPoint(evt) {
    var rect = svg.getBoundingClientRect();
    return {
      x: ((evt.clientX - rect.left) / rect.width) * 300,
      y: ((evt.clientY - rect.top) / rect.height) * 300,
    };
  }

  var dragTarget = null; // 1 or 2
  function startDrag(evt, which) {
    if (!currentPreset().bezier) return;
    dragTarget = which;
    evt.target.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  }
  function moveDrag(evt) {
    if (!dragTarget) return;
    var p = svgPoint(evt);
    var b = currentPreset().bezier.slice();
    var nx = clamp(E.round(fromPx(p.x), 3), 0, 1);
    var ny = clamp(E.round(fromPy(p.y), 3), -0.6, 1.6);
    if (dragTarget === 1) { b[0] = nx; b[1] = ny; }
    else { b[2] = nx; b[3] = ny; }
    setCustomBezier(b);
  }
  function endDrag() { dragTarget = null; }

  handle1.addEventListener("pointerdown", function (e) { startDrag(e, 1); });
  handle2.addEventListener("pointerdown", function (e) { startDrag(e, 2); });
  svg.addEventListener("pointermove", moveDrag);
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  // Keyboard: arrows nudge the focused handle, shift = bigger steps.
  function handleKeys(evt, which) {
    var preset = currentPreset();
    if (!preset.bezier) return;
    var step = evt.shiftKey ? 0.1 : 0.01;
    var b = preset.bezier.slice();
    var idx = which === 1 ? 0 : 2;
    var idy = which === 1 ? 1 : 3;
    if (evt.key === "ArrowLeft") b[idx] = clamp(E.round(b[idx] - step, 3), 0, 1);
    else if (evt.key === "ArrowRight") b[idx] = clamp(E.round(b[idx] + step, 3), 0, 1);
    else if (evt.key === "ArrowUp") b[idy] = clamp(E.round(b[idy] + step, 3), -0.6, 1.6);
    else if (evt.key === "ArrowDown") b[idy] = clamp(E.round(b[idy] - step, 3), -0.6, 1.6);
    else return;
    evt.preventDefault();
    setCustomBezier(b);
  }
  handle1.addEventListener("keydown", function (e) { handleKeys(e, 1); });
  handle2.addEventListener("keydown", function (e) { handleKeys(e, 2); });

  // Number inputs.
  ["numX1", "numY1", "numX2", "numY2"].forEach(function (id, i) {
    $(id).addEventListener("change", function () {
      var preset = currentPreset();
      if (!preset.bezier) return;
      var b = preset.bezier.slice();
      var v = parseFloat($(id).value);
      if (isNaN(v)) { drawEditor(); return; } // reset to the real value
      if (i === 0 || i === 2) v = clamp(v, 0, 1);
      else v = clamp(v, -0.6, 1.6);
      b[i] = E.round(v, 3);
      setCustomBezier(b);
    });
  });

  // Paste a cubic-bezier string.
  on("pasteApply", "click", function () {
    var msg = $("pasteMsg");
    var parsed = E.parseBezier($("pasteInput").value);
    if (!parsed) {
      msg.textContent = "That didn't parse. Try cubic-bezier(0.34, 1.56, 0.64, 1) — x values must be between 0 and 1.";
      msg.classList.add("error");
      return;
    }
    msg.textContent = "Loaded " + E.formatBezier(parsed) + ".";
    msg.classList.remove("error");
    setCustomBezier(parsed);
  });

  on("randomBtn", "click", function () {
    var r = function (lo, hi) { return E.round(lo + Math.random() * (hi - lo), 2); };
    setCustomBezier([r(0, 1), r(-0.5, 1.5), r(0, 1), r(-0.5, 1.5)]);
  });
  on("resetBtn", "click", function () { loadPreset("ease-out-cubic"); });

  // --- presets ---------------------------------------------------------------
  function miniCurvePath(preset) {
    var pts = E.curvePoints(preset, 24);
    return pts
      .map(function (p, i) {
        var x = 6 + p[0] * 108;
        var y = 50 - ((p[1] + 0.6) / 2.2) * 44;
        return (i === 0 ? "M " : "L ") + x.toFixed(1) + " " + y.toFixed(1);
      })
      .join(" ");
  }

  function buildPresets() {
    var grid = $("presetGrid");
    E.PRESETS.forEach(function (preset) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset";
      btn.dataset.presetId = preset.id;
      var val = preset.bezier ? E.formatBezier(preset.bezier) : "keyframes";
      btn.innerHTML =
        '<svg viewBox="0 0 120 56" aria-hidden="true">' +
        '<line x1="6" y1="38" x2="114" y2="38" stroke="#e7d6bf" stroke-width="1"/>' +
        '<line x1="6" y1="18" x2="114" y2="18" stroke="#e7d6bf" stroke-width="1"/>' +
        '<path d="' + miniCurvePath(preset) + '" fill="none" stroke="#e8490f" stroke-width="2" stroke-linecap="round"/>' +
        "</svg>" +
        '<span class="p-name">' + preset.name + "</span>" +
        '<span class="p-val">' + val + "</span>" +
        (preset.keyframes ? '<span class="p-kind">Keyframes</span>' : "");
      btn.addEventListener("click", function () { loadPreset(preset.id); });
      grid.appendChild(btn);
    });
  }

  function markActivePreset(id) {
    document.querySelectorAll(".preset").forEach(function (el) {
      el.classList.toggle("active", el.dataset.presetId === id);
    });
  }

  function loadPreset(id) {
    var preset = E.presetById(id);
    if (!preset) return;
    state.preset = preset;
    state.customBezier = null;
    markActivePreset(id);
    drawEditor();
  }

  // --- animation driver --------------------------------------------------------
  var rafId = null;
  var playStart = 0;
  var playing = false;

  function stopPlay() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    playing = false;
    var btn = $("playBtn");
    btn.textContent = "▶";
    btn.setAttribute("aria-label", "Play");
  }

  function applyFrame(eased) {
    var shown = state.reverse ? 1 - eased : eased;
    var dot = $("slideDot");
    var track = dot.parentElement;
    // Dot is 30px wide; the last 20px are reserved for the finish marks,
    // so the dot stops just short of them instead of painting over them.
    var travel = track.clientWidth - 50;
    dot.style.transform = "translateX(" + (clamp(shown, 0, 1) * travel) + "px)";
    $("slidePct").textContent = Math.round(clamp(shown, 0, 1) * 100) + "%";

    var pop = $("popCard");
    var scale = 0.6 + 0.4 * clamp(shown, 0, 1);
    pop.style.transform = "scale(" + scale.toFixed(3) + ")";
    pop.style.opacity = clamp(shown, 0, 1).toFixed(3);
    $("popPct").textContent = "scale " + scale.toFixed(2);

    $("barFill").style.width = clamp(shown, 0, 1) * 100 + "%";
    $("barPct").textContent = Math.round(clamp(shown, 0, 1) * 100) + "%";
  }

  function play() {
    stopPlay();
    playing = true;
    var btn = $("playBtn");
    btn.textContent = "■";
    btn.setAttribute("aria-label", "Stop");
    applyFrame(0);
    playStart = performance.now() + state.delay;

    function tick(now) {
      if (!playing) return;
      var p = clamp((now - playStart) / state.duration, 0, 1);
      applyFrame(E.easeAt(p, currentPreset()));
      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      } else if (state.loop) {
        playStart = performance.now() + 250; // short breath between loops
        rafId = requestAnimationFrame(tick);
      } else {
        stopPlay();
        applyFrame(1);
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  on("playBtn", "click", function () {
    if (playing) stopPlay();
    else play();
  });

  // Transport controls.
  on("durationRange", "input", function () {
    state.duration = parseInt($("durationRange").value, 10);
    $("durationOut").textContent = state.duration + "ms";
  });
  on("delayRange", "input", function () {
    state.delay = parseInt($("delayRange").value, 10);
    $("delayOut").textContent = state.delay + "ms";
  });
  function wireToggle(id, key) {
    $(id).addEventListener("click", function () {
      state[key] = !state[key];
      $(id).setAttribute("aria-pressed", String(state[key]));
    });
  }
  wireToggle("loopToggle", "loop");
  wireToggle("reverseToggle", "reverse");

  // --- compare / race ------------------------------------------------------------
  function timeToHalf(preset) {
    // First progress where the eased value reaches 0.5 — a fair "who feels
    // faster" number, independent of the final settle.
    for (var p = 0; p <= 1.0001; p += 0.002) {
      if (E.easeAt(p, preset) >= 0.5) return Math.round(p * state.duration);
    }
    return state.duration;
  }

  function buildCompareSelect() {
    var sel = $("compareSelect");
    E.PRESETS.forEach(function (preset) {
      var opt = document.createElement("option");
      opt.value = preset.id;
      opt.textContent = preset.name;
      sel.appendChild(opt);
    });
    sel.value = state.compareId;
    sel.addEventListener("change", function () { state.compareId = sel.value; });
  }

  var raceRaf = null;
  on("raceBtn", "click", function () {
    if (raceRaf !== null) cancelAnimationFrame(raceRaf);
    var yours = currentPreset();
    var theirs = E.presetById(state.compareId);
    var yoursEl = $("raceYours");
    var theirsEl = $("raceTheirs");
    var start = performance.now() + 100;
    $("raceResult").innerHTML =
      "Halfway: <b>yours " + timeToHalf(yours) + "ms</b> vs <b>" +
      theirs.name.toLowerCase() + " " + timeToHalf(theirs) + "ms</b>";

    function tick(now) {
      var p = clamp((now - start) / state.duration, 0, 1);
      // Same 20px reservation as the preview dot — stop short of the marks.
      var travelY = yoursEl.parentElement.clientWidth - 50;
      var travelT = theirsEl.parentElement.clientWidth - 50;
      yoursEl.style.transform =
        "translateX(" + (clamp(E.easeAt(p, yours), 0, 1) * travelY) + "px)";
      theirsEl.style.transform =
        "translateX(" + (clamp(E.easeAt(p, theirs), 0, 1) * travelT) + "px)";
      if (p < 1) raceRaf = requestAnimationFrame(tick);
      else raceRaf = null;
    }
    raceRaf = requestAnimationFrame(tick);
  });

  // --- code output ---------------------------------------------------------------
  function codeFor(tab) {
    var preset = currentPreset();
    var dur = state.duration;
    var delay = state.delay;
    if (tab === "css") {
      if (preset.bezier) {
        return (
          "/* " + preset.name + " — " + E.formatBezier(preset.bezier) + " */\n" +
          ".thing {\n" +
          "  transition-timing-function: " + E.formatBezier(preset.bezier) + ";\n" +
          "  transition-duration: " + dur + "ms;\n" +
          "  transition-delay: " + delay + "ms;\n" +
          "}"
        );
      }
      return (
        "/* " + preset.name + " — sampled keyframes, 5% steps */\n" +
        "@property --e {\n" +
        '  syntax: "<number>";\n' +
        "  inherits: false;\n" +
        "  initial-value: 0;\n" +
        "}\n\n" +
        E.keyframesCss(preset.id, preset.keyframes) +
        "\n\n.thing {\n" +
        "  animation: " + preset.id + " " + dur + "ms linear both;\n" +
        "  /* drive any property from the eased value, e.g. */\n" +
        "  transform: translateX(calc(var(--e) * 240px));\n" +
        "}"
      );
    }
    if (tab === "tailwind") {
      if (preset.bezier) {
        return (
          "<!-- arbitrary value — paste straight into a class -->\n" +
          '<div class="transition-all duration-[' + dur + 'ms] ease-[' +
          E.formatBezier(preset.bezier).replace(/ /g, "_") +
          ']">\n  ...\n</div>'
        );
      }
      return (
        "<!-- keyframe easings need a custom animation in tailwind.config.js -->\n" +
        "// tailwind.config.js\n" +
        "animation: { '" + preset.id + "': '" + preset.id + " " + dur + "ms linear both' },\n" +
        "keyframes: { /* paste the @keyframes from the CSS tab here */ }"
      );
    }
    // Keyframes tab: sampled stops for whatever curve is current.
    var stops = preset.keyframes || E.sampleKeyframes(function (t) {
      return E.easeAt(t, preset);
    }, 0.05);
    return (
      "/* sampled from the current curve, 5% steps — drop into any stylesheet */\n" +
      "@property --e {\n" +
      '  syntax: "<number>";\n' +
      "  inherits: false;\n" +
      "  initial-value: 0;\n" +
      "}\n\n" +
      E.keyframesCss("easeviz-curve", stops)
    );
  }

  function updateCode() {
    $("codePre").textContent = codeFor(state.codeTab);
  }

  document.querySelectorAll("[data-code-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.codeTab = btn.dataset.codeTab;
      document.querySelectorAll("[data-code-tab]").forEach(function (b) {
        b.setAttribute("aria-selected", String(b === btn));
      });
      updateCode();
    });
  });

  on("copyCodeBtn", "click", function () {
    copyText($("codePre").textContent, $("copyCodeBtn"));
  });

  // --- boot ----------------------------------------------------------------------
  buildGrid();
  buildPresets();
  buildCompareSelect();
  loadPreset("ease-out-cubic");
  applyFrame(0);
  play(); // autoplay once so the page is alive on arrival
})();
