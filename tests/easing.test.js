// Tests for easing.js — run with: node tests/easing.test.js
// No dependencies; plain node:assert. Exit code 0 means everything passed.
"use strict";

var assert = require("assert");
var E = require("../easing.js");

var passed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log("ok - " + name);
  } catch (err) {
    console.error("FAIL - " + name);
    console.error("  " + err.message);
    process.exitCode = 1;
  }
}

function approx(a, b, tol) {
  return Math.abs(a - b) <= (tol || 0.001);
}

// bezierAt: endpoints and identity cases
check("bezierAt returns 0 at progress 0 and 1 at progress 1", function () {
  assert.strictEqual(E.bezierAt(0, 0.34, 1.56, 0.64, 1), 0);
  assert.strictEqual(E.bezierAt(1, 0.34, 1.56, 0.64, 1), 1);
});

check("bezierAt on a linear curve is the identity", function () {
  [0.1, 0.25, 0.5, 0.75, 0.9].forEach(function (t) {
    assert.ok(approx(E.bezierAt(t, 0, 0, 1, 1), t, 0.001), "t=" + t);
  });
});

check("bezierAt on ease-out-cubic is faster than linear early on", function () {
  var v = E.bezierAt(0.25, 0.33, 1, 0.68, 1);
  assert.ok(v > 0.25, "expected > 0.25, got " + v);
});

check("bezierAt on ease-out-back overshoots past 1", function () {
  var max = 0;
  for (var t = 0; t <= 1; t += 0.05) {
    max = Math.max(max, E.bezierAt(t, 0.34, 1.56, 0.64, 1));
  }
  assert.ok(max > 1.0, "expected overshoot, max=" + max);
});

check("bezierAt is monotonic for a normal (non-overshoot) curve", function () {
  var prev = -1;
  for (var t = 0; t <= 1; t += 0.02) {
    var v = E.bezierAt(t, 0.42, 0, 0.58, 1);
    assert.ok(v >= prev - 0.0001, "went backwards at t=" + t);
    prev = v;
  }
});

// easeAt: keyframe presets
check("easeAt on bounce ends at 1 and stays in a sane range", function () {
  var p = E.presetById("ease-out-bounce");
  assert.strictEqual(E.easeAt(0, p), 0);
  assert.strictEqual(E.easeAt(1, p), 1);
  for (var t = 0; t <= 1; t += 0.05) {
    var v = E.easeAt(t, p);
    assert.ok(v >= -0.01 && v <= 1.01, "bounce out of range at t=" + t + ": " + v);
  }
});

check("easeAt on elastic overshoots and settles at 1", function () {
  var p = E.presetById("ease-out-elastic");
  var max = 0;
  for (var t = 0; t <= 1; t += 0.02) {
    max = Math.max(max, E.easeAt(t, p));
  }
  assert.ok(max > 1.05, "elastic should overshoot, max=" + max);
  assert.strictEqual(E.easeAt(1, p), 1);
});

// Presets: every one is well-formed
check("every preset has an id, a name, and a usable shape", function () {
  var ids = {};
  E.PRESETS.forEach(function (p) {
    assert.ok(p.id && p.name, "preset missing id/name: " + JSON.stringify(p));
    assert.ok(!ids[p.id], "duplicate id: " + p.id);
    ids[p.id] = true;
    if (p.bezier) {
      assert.strictEqual(p.bezier.length, 4);
      assert.ok(p.bezier[0] >= 0 && p.bezier[0] <= 1, p.id + " x1 out of range");
      assert.ok(p.bezier[2] >= 0 && p.bezier[2] <= 1, p.id + " x2 out of range");
    } else {
      assert.ok(Array.isArray(p.keyframes) && p.keyframes.length > 2, p.id + " bad keyframes");
      assert.strictEqual(p.keyframes[0][0], 0);
      assert.strictEqual(p.keyframes[p.keyframes.length - 1][0], 1);
    }
  });
  assert.ok(E.PRESETS.length >= 18, "expected at least 18 presets, got " + E.PRESETS.length);
});

check("presetById finds presets and returns null for unknown ids", function () {
  assert.strictEqual(E.presetById("ease-out").name, "Ease Out");
  assert.strictEqual(E.presetById("nope"), null);
});

check("curvePoints spans 0..1 with the right endpoints", function () {
  var pts = E.curvePoints(E.presetById("ease-out-cubic"));
  assert.strictEqual(pts[0][0], 0);
  assert.strictEqual(pts[pts.length - 1][0], 1);
  assert.ok(approx(pts[0][1], 0));
  assert.ok(approx(pts[pts.length - 1][1], 1));
});

// parse / format round-trip
check("parseBezier accepts a well-formed cubic-bezier string", function () {
  assert.deepStrictEqual(E.parseBezier("cubic-bezier(0.1, 0.7, 1.0, 0.1)"), [0.1, 0.7, 1, 0.1]);
  assert.deepStrictEqual(E.parseBezier("  cubic-bezier(0,0,0.58,1)  "), [0, 0, 0.58, 1]);
});

check("parseBezier rejects junk and out-of-range x values", function () {
  assert.strictEqual(E.parseBezier("cubic-bezier(1.5, 0, 0.5, 1)"), null);
  assert.strictEqual(E.parseBezier("cubic-bezier(-0.1, 0, 0.5, 1)"), null);
  assert.strictEqual(E.parseBezier("cubic-bezier(0.1, 0.7, 1)"), null);
  assert.strictEqual(E.parseBezier("ease"), null);
  assert.strictEqual(E.parseBezier(""), null);
  assert.strictEqual(E.parseBezier(null), null);
});

check("formatBezier round-trips through parseBezier", function () {
  var b = [0.34, 1.56, 0.64, 1];
  assert.deepStrictEqual(E.parseBezier(E.formatBezier(b)), b);
});

check("keyframesCss emits a valid-looking @keyframes block", function () {
  var css = E.keyframesCss("ease-out-bounce", E.presetById("ease-out-bounce").keyframes);
  assert.ok(css.indexOf("@keyframes ease-out-bounce {") === 0);
  assert.ok(css.indexOf("0% {") !== -1);
  assert.ok(css.indexOf("100% {") !== -1);
});

check("sampleKeyframes always starts at 0 and ends at 1", function () {
  var stops = E.sampleKeyframes(E.bounceOut, 0.07);
  assert.strictEqual(stops[0][0], 0);
  assert.strictEqual(stops[stops.length - 1][0], 1);
  for (var i = 1; i < stops.length; i++) {
    assert.ok(stops[i][0] > stops[i - 1][0], "stops must be increasing");
  }
});

console.log("\n" + passed + " checks passed");
