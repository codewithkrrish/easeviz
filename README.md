# easeviz

A CSS easing studio that fits in one folder. Drag a curve, watch it move on
real elements, copy the CSS.

I kept running into the same problem: I'd pick `ease-out` or `ease-in-out`
because they were there, not because they felt right — and then I'd open
three different easing sites, guess a cubic-bezier, paste it in, and still
not be sure. So I built the tool I wanted: the curve editor, the preview,
and the code, all on one page, with nothing to install.

Open `index.html` and it just works. No build step, no dependencies, no
network calls — it even works from disk. Or try the live demo:
**https://easeviz.vercel.app**

## What it does

- **Curve editor** — drag the two control points, nudge them with arrow keys,
  type exact numbers, or paste a `cubic-bezier(...)` value you found somewhere.
  The plot shows down to −0.6 and up to 1.6, so overshoot curves (the "back"
  easings) are fully visible instead of clipped.
- **Live preview** — a dot sliding across a track, a card popping in, and a
  progress bar filling up, all driven by your exact curve. Duration, delay,
  loop, and reverse controls. The previews are solved with the same
  Newton-plus-bisection math browsers use, not faked with a CSS transition.
- **20 presets** — the classics (linear through expo) plus ease-out-back,
  ease-in-back, and the two that can't be a bezier at all: bounce and elastic.
  Those two are sampled keyframes, and the page says so instead of pretending.
- **Race it** — your curve against any preset, same distance, same duration,
  with halfway times so you can see which one actually feels faster.
- **Copy-ready code** — CSS, a Tailwind arbitrary value, or sampled
  `@keyframes` for any curve. Keyframe easings use a registered `--e` custom
  property so the value interpolates smoothly between stops.

## Try it

No install. Either open the file:

```bash
open index.html
```

or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## The easing math

The solver lives in `easing.js`, separate from the page wiring, so it can be
tested on its own:

```bash
node tests/easing.test.js
# 15 checks passed
```

It inverts the bezier with Newton-Raphson and falls back to bisection on flat
spots (the linear curve is the classic case — Newton alone lands about 0.01
off, which I caught the first time the tests ran). Bounce and elastic come
from the Penner formulas, sampled at 5% steps into keyframes.

## Project structure

```
easeviz/
├── index.html            # the whole page — layout, editor, previews
├── style.css             # warm paper theme, coral accent, no frameworks
├── easing.js             # bezier solver, presets, keyframe sampling (no DOM)
├── app.js                # editor, previews, race, code output
└── tests/
    └── easing.test.js    # node:assert tests, zero dependencies
```

## Which easing should I use?

Short version, from using this thing a lot:

- UI appearing on screen: **ease-out-cubic** (quick start, soft landing).
- Something playful, a button or a card: **ease-out-back** (overshoots, settles).
- Something leaving the screen: **ease-in** (slow start feels like it's being
  pulled away).
- Avoid ease-in for things appearing — a slow start reads as lag.

## Limitations

- Bounce and elastic can't be edited by dragging — no single bezier can draw
  them. You get the keyframes instead.
- The `@property` trick for keyframe easings needs a browser from the last
  couple of years; older browsers step between the 5% stops instead of
  interpolating. Still looks like a bounce, just slightly less smooth.
- The previews run on `requestAnimationFrame`, so a busy tab can make them
  look choppier than the real CSS transition would. The code you copy is the
  real thing — trust it over the preview.
- No saving or sharing yet — if you make a curve you love, copy the code
  before you close the tab. (That one's on my list.)

## License

MIT — see [LICENSE](LICENSE).

Built by [Krrish](https://github.com/codewithkrrish).
