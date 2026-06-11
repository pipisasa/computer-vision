# Finger Tracking

**[▶ Live demo](https://pipisasa.github.io/computer-vision/)** — allow camera
access and raise your hands.

Real-time hand and finger tracking in the browser. Tracks up to two hands with
the camera, draws hand skeletons, counts raised fingers, recognizes simple
gestures, and connects matching fingertips across hands — the space between
those lines is rendered through live video filters (negative, hue shifts, acid
duotone) that stretch and warp as you move your fingers.

Everything runs client-side — no backend, no build step, and no video ever
leaves your machine.

## How it works

- [MediaPipe HandLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
  (loaded from CDN, GPU-accelerated WASM) detects 21 3D landmarks per hand in
  every video frame.
- A palm detector finds hands; a landmark model regresses the joints. In video
  mode the model tracks hands between frames, so the expensive full-frame
  search runs rarely — expect ~50 FPS.
- Everything else is plain geometry on the 21 normalized `(x, y)` points:
  - **Skeleton** — lines between anatomical joint pairs.
  - **Fingers up** — a finger counts as raised when its tip is above the joint
    below it (the thumb compares sideways, using the handedness label).
  - **Gestures** — named off the raised-finger count (fist, point, peace, open
    hand).
  - **Filter bands** — with two hands in frame, matching fingertips connect
    with colored lines; each quad between adjacent lines becomes a canvas clip
    path and the live video is redrawn through a different CSS filter inside
    it.

## Run it

Camera access requires a secure context (localhost or HTTPS), so serve the
files instead of opening `index.html` directly:

```sh
python3 -m http.server 8080
```

Open <http://localhost:8080>, allow camera access, and raise your hands.

## Tweak it

- `BAND_FILTERS` in `main.js` — the four filters between finger lines; any CSS
  filter works (`sepia`, `contrast`, combinations like `"blur(4px) invert(1)"`).
- `FINGER_COLORS` — line and fingertip colors per finger.
- `numHands` in the HandLandmarker options — track more than two hands
  (finger links and bands are wired for the first two).

## Browser support

Chrome and Firefox. The filter bands rely on the canvas 2D `filter` property,
which older Safari versions don't support.
