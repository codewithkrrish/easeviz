// easeviz — the easing math. Pure functions, no DOM in here, so the same
// file can be tested with plain node and used straight from the page.
//
// A cubic-bezier easing is defined by two control points (x1, y1) and
// (x2, y2). x must stay inside [0, 1] (time only moves forward); y is free
// to overshoot, which is how the "back" easings get their snap.
//
// Bounce and elastic can't be a single cubic-bezier, so those presets are
// sampled keyframes instead — same idea, different shape. The page treats
// both kinds through one function: easeAt(progress, preset).

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.Easeviz = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NEWTON_ITERATIONS = 4;
  var NEWTON_MIN_SLOPE = 0.001;
  var SUBDIVISION_PRECISION = 0.0000001;

  // --- cubic-bezier helpers (same approach browsers use) -------------------

  function bezierCoord(t, p1, p2) {
    // B(t) for one axis, with endpoints fixed at 0 and 1.
    var u = 1 - t;
    return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
  }

  function bezierSlope(t, p1, p2) {
    var u = 1 - t;
    return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
  }

  // Given an x (time) in [0, 1], find the t that produces it.
  function solveForT(x, x1, x2) {
    // Newton first — fast when the curve is well behaved.
    var t = x;
    for (var i = 0; i < NEWTON_ITERATIONS; i++) {
      var currentX = bezierCoord(t, x1, x2) - x;
      if (Math.abs(currentX) < SUBDIVISION_PRECISION) return t;
      var slope = bezierSlope(t, x1, x2);
      if (Math.abs(slope) < NEWTON_MIN_SLOPE) break;
      t -= currentX / slope;
    }
    // Newton missed (flat spot) — bisection always lands, just slower.
    var lo = 0;
    var hi = 1;
    t = x;
    while (lo < hi) {
      var midX = bezierCoord(t, x1, x2);
      if (Math.abs(midX - x) < SUBDIVISION_PRECISION) return t;
      if (x > midX) lo = t;
      else hi = t;
      t = (hi - lo) * 0.5 + lo;
    }
    return t;
  }

  function bezierAt(progress, x1, y1, x2, y2) {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    var t = solveForT(progress, x1, x2);
    return bezierCoord(t, y1, y2);
  }

  // --- Penner functions, sampled into keyframes ---------------------------
  // Bounce and elastic are defined by the classic Robert Penner formulas,
  // then sampled at even steps so they can be emitted as real CSS
  // @keyframes with linear interpolation between stops.

  function bounceOut(t) {
    var n1 = 7.5625;
    var d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }

  function elasticOut(t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    var c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }

  // Sample a 0..1 function into [time, value] stops, every `step` of the way.
  function sampleKeyframes(fn, step) {
    step = step || 0.05;
    var stops = [];
    for (var t = 0; t <= 1.0001; t += step) {
      var tt = Math.min(1, t);
      stops.push([round(tt, 4), round(fn(tt), 4)]);
    }
    // Guarantee a clean 1.0 endpoint even if the step didn't land on it.
    if (stops[stops.length - 1][0] !== 1) stops.push([1, round(fn(1), 4)]);
    return stops;
  }

  // --- generic evaluation --------------------------------------------------

  // progress: 0..1 time. Returns the eased 0..1 value (may overshoot for
  // back/elastic presets — that's the point).
  function easeAt(progress, preset) {
    if (preset.keyframes) {
      var stops = preset.keyframes;
      if (progress <= 0) return stops[0][1];
      if (progress >= 1) return stops[stops.length - 1][1];
      for (var i = 1; i < stops.length; i++) {
        if (progress <= stops[i][0]) {
          var t0 = stops[i - 1][0];
          var v0 = stops[i - 1][1];
          var t1 = stops[i][0];
          var v1 = stops[i][1];
          var local = (progress - t0) / (t1 - t0);
          return v0 + (v1 - v0) * local;
        }
      }
      return stops[stops.length - 1][1];
    }
    var b = preset.bezier;
    return bezierAt(progress, b[0], b[1], b[2], b[3]);
  }

  // --- formatting / parsing -----------------------------------------------

  function round(n, places) {
    var f = Math.pow(10, places);
    return Math.round(n * f) / f;
  }

  function formatBezier(bezier) {
    return (
      "cubic-bezier(" +
      bezier.map(function (n) { return round(n, 3); }).join(", ") +
      ")"
    );
  }

  function formatNumber(n) {
    return String(round(n, 3));
  }

  // Parse "cubic-bezier(0.1, 0.7, 1, 0.1)" (whitespace tolerated) into
  // [x1, y1, x2, y2], or null when it doesn't parse. x values outside
  // [0, 1] are rejected — CSS does the same.
  function parseBezier(text) {
    if (typeof text !== "string") return null;
    var m = text
      .trim()
      .match(
        /^cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/
      );
    if (!m) return null;
    var vals = [1, 2, 3, 4].map(function (i) { return parseFloat(m[i]); });
    if (vals.some(isNaN)) return null;
    if (vals[0] < 0 || vals[0] > 1 || vals[2] < 0 || vals[2] > 1) return null;
    return vals;
  }

  function keyframesCss(name, stops) {
    var lines = ["@keyframes " + name + " {"];
    stops.forEach(function (stop) {
      lines.push(
        "  " + round(stop[0] * 100, 2) + "% { --e: " + stop[1] + "; }"
      );
    });
    lines.push("}");
    return lines.join("\n");
  }

  // --- presets -------------------------------------------------------------

  function bezierPreset(id, name, b, blurb) {
    return { id: id, name: name, bezier: b, blurb: blurb };
  }

  var PRESETS = [
    bezierPreset("linear", "Linear", [0, 0, 1, 1], "No easing. Constant speed, start to finish."),
    bezierPreset("ease", "Ease", [0.25, 0.1, 0.25, 1], "The CSS default. Gentle start, gentle stop."),
    bezierPreset("ease-in", "Ease In", [0.42, 0, 1, 1], "Slow start, speeds up. Good for things leaving the screen."),
    bezierPreset("ease-out", "Ease Out", [0, 0, 0.58, 1], "Fast start, soft landing. The most-used easing on the web."),
    bezierPreset("ease-in-out", "Ease In Out", [0.42, 0, 0.58, 1], "Slow both ends. Calm, symmetrical, a bit sleepy."),
    bezierPreset("ease-in-quad", "Ease In Quad", [0.11, 0, 0.5, 0], "A light acceleration. Barely there, but noticeable."),
    bezierPreset("ease-out-quad", "Ease Out Quad", [0.5, 1, 0.89, 1], "A light deceleration. Snappy without feeling abrupt."),
    bezierPreset("ease-in-out-quad", "Ease In Out Quad", [0.45, 0, 0.55, 1], "Quad, both ends. Smooth and unremarkable — in a good way."),
    bezierPreset("ease-in-cubic", "Ease In Cubic", [0.32, 0, 0.67, 0], "Stronger pull-in than quad. Feels deliberate."),
    bezierPreset("ease-out-cubic", "Ease Out Cubic", [0.33, 1, 0.68, 1], "My default for UI that appears. Quick, then settles."),
    bezierPreset("ease-in-out-cubic", "Ease In Out Cubic", [0.65, 0, 0.35, 1], "Cubic, both ends. The workhorse for modals and panels."),
    bezierPreset("ease-out-quart", "Ease Out Quart", [0.25, 1, 0.5, 1], "Glides in and stops on a dime. Great for toasts."),
    bezierPreset("ease-in-expo", "Ease In Expo", [0.7, 0, 0.84, 0], "Waits, then rushes. Dramatic entrances only."),
    bezierPreset("ease-out-expo", "Ease Out Expo", [0.16, 1, 0.3, 1], "Almost instant, then a long soft tail. Feels expensive."),
    bezierPreset("ease-in-out-expo", "Ease In Out Expo", [0.87, 0, 0.13, 1], "Long pause at both ends. Use sparingly — it drags."),
    bezierPreset("ease-out-back", "Ease Out Back", [0.34, 1.56, 0.64, 1], "Overshoots, then settles back. Playful pop for buttons and cards."),
    bezierPreset("ease-in-back", "Ease In Back", [0.36, 0, 0.66, -0.56], "Pulls back first, then launches. The wind-up before a throw."),
    bezierPreset("ease-in-out-back", "Ease In Out Back", [0.68, -0.6, 0.32, 1.6], "Overshoots on both ends. Fun, but easy to overuse."),
    {
      id: "ease-out-bounce",
      name: "Ease Out Bounce",
      keyframes: sampleKeyframes(bounceOut, 0.05),
      blurb: "Bounces to a stop like a dropped ball. Needs keyframes — no single bezier can do this.",
    },
    {
      id: "ease-out-elastic",
      name: "Ease Out Elastic",
      keyframes: sampleKeyframes(elasticOut, 0.05),
      blurb: "Wobbles past the end and settles. Also keyframes — a bezier can't oscillate.",
    },
  ];

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  // Points along a preset's curve for drawing (sampled, 0..1).
  function curvePoints(preset, steps) {
    steps = steps || 48;
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      pts.push([t, easeAt(t, preset)]);
    }
    return pts;
  }

  return {
    bezierAt: bezierAt,
    easeAt: easeAt,
    sampleKeyframes: sampleKeyframes,
    bounceOut: bounceOut,
    elasticOut: elasticOut,
    formatBezier: formatBezier,
    formatNumber: formatNumber,
    parseBezier: parseBezier,
    keyframesCss: keyframesCss,
    curvePoints: curvePoints,
    presetById: presetById,
    PRESETS: PRESETS,
    round: round,
  };
});
