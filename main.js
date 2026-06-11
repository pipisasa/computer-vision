import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const loading = document.getElementById("loading");
const handCountEl = document.getElementById("hand-count");
const fingerCountEl = document.getElementById("finger-count");
const gestureEl = document.getElementById("gesture");
const fpsEl = document.getElementById("fps");

const overlayCtx = overlay.getContext("2d");

// Landmark indices (MediaPipe hand model: 21 points per hand)
const THUMB_TIP = 4;
const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 6, 10, 14, 18]; // joint below each tip

// One color per finger pair: thumb, index, middle, ring, pinky
const FINGER_COLORS = ["#ff5277", "#ffb84d", "#fff200", "#00dc82", "#4dc3ff"];

// One filter per band between adjacent finger lines:
// thumb–index, index–middle, middle–ring, ring–pinky
const BAND_FILTERS = [
  // thumb–index: negative
  "invert(1)",
  // index–middle: cold shifted hues, oversaturated
  "hue-rotate(120deg) saturate(2.5)",
  // middle–ring: opposite hue shift, slightly punchy
  "hue-rotate(240deg) saturate(2) contrast(1.3)",
  // ring–pinky: acid duotone — sepia base re-tinted to toxic green
  "sepia(1) hue-rotate(60deg) saturate(4) contrast(1.4)",
];

// Skeleton connections between landmarks
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],        // index
  [5, 9], [9, 10], [10, 11], [11, 12],   // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20],// pinky
  [0, 17],                               // palm edge
];

let handLandmarker = null;
let lastVideoTime = -1;
let lastFrameTime = performance.now();

async function init() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((resolve) => (video.onloadedmetadata = resolve));

  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  // Match the stage to the camera's real aspect ratio so the video isn't
  // cropped and overlay coordinates line up edge to edge
  document.getElementById("stage").style.aspectRatio =
    `${video.videoWidth} / ${video.videoHeight}`;

  loading.classList.add("hidden");
  requestAnimationFrame(loop);
}

function loop() {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = handLandmarker.detectForVideo(video, performance.now());
    render(result);
    updateFps();
  }
  requestAnimationFrame(loop);
}

function render(result) {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  const hands = result.landmarks ?? [];
  handCountEl.textContent = hands.length;

  let totalFingersUp = 0;
  const gestures = [];

  // Filter bands go first so skeletons and lines render on top
  if (hands.length === 2) {
    drawFilterBands(hands[0], hands[1]);
  }

  hands.forEach((landmarks, i) => {
    const handedness = result.handedness?.[i]?.[0]?.categoryName ?? "Right";
    drawSkeleton(landmarks);

    const fingersUp = countFingersUp(landmarks, handedness);
    totalFingersUp += fingersUp;
    gestures.push(nameGesture(fingersUp));
  });

  if (hands.length === 2) {
    drawFingerLinks(hands[0], hands[1]);
  }

  fingerCountEl.textContent = hands.length ? totalFingersUp : "–";
  gestureEl.textContent = gestures.length ? gestures.join(" · ") : "–";
}

// Each band is the quad spanned by two adjacent finger lines:
// tipA[f] → tipB[f] → tipB[f+1] → tipA[f+1]. Clip to it and redraw
// the live video through a CSS filter.
function drawFilterBands(handA, handB) {
  const w = overlay.width;
  const h = overlay.height;

  for (let f = 0; f < FINGER_TIPS.length - 1; f++) {
    const t1 = FINGER_TIPS[f];
    const t2 = FINGER_TIPS[f + 1];

    overlayCtx.save();
    overlayCtx.beginPath();
    overlayCtx.moveTo(handA[t1].x * w, handA[t1].y * h);
    overlayCtx.lineTo(handB[t1].x * w, handB[t1].y * h);
    overlayCtx.lineTo(handB[t2].x * w, handB[t2].y * h);
    overlayCtx.lineTo(handA[t2].x * w, handA[t2].y * h);
    overlayCtx.closePath();
    overlayCtx.clip();
    overlayCtx.filter = BAND_FILTERS[f];
    overlayCtx.drawImage(video, 0, 0, w, h);
    overlayCtx.restore();
  }
}

// Connect each fingertip of one hand to the same fingertip of the other
function drawFingerLinks(handA, handB) {
  const w = overlay.width;
  const h = overlay.height;

  FINGER_TIPS.forEach((tip, f) => {
    const a = handA[tip];
    const b = handB[tip];

    overlayCtx.strokeStyle = FINGER_COLORS[f];
    overlayCtx.lineWidth = 4;
    overlayCtx.lineCap = "round";
    overlayCtx.beginPath();
    overlayCtx.moveTo(a.x * w, a.y * h);
    overlayCtx.lineTo(b.x * w, b.y * h);
    overlayCtx.stroke();
  });
}

function drawSkeleton(landmarks) {
  const w = overlay.width;
  const h = overlay.height;

  overlayCtx.strokeStyle = "rgba(0, 220, 130, 0.9)";
  overlayCtx.lineWidth = 3;
  for (const [a, b] of CONNECTIONS) {
    overlayCtx.beginPath();
    overlayCtx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
    overlayCtx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
    overlayCtx.stroke();
  }

  landmarks.forEach((lm, idx) => {
    const tipIndex = FINGER_TIPS.indexOf(idx);
    const isTip = tipIndex !== -1;
    overlayCtx.beginPath();
    overlayCtx.arc(lm.x * w, lm.y * h, isTip ? 7 : 4, 0, Math.PI * 2);
    overlayCtx.fillStyle = isTip ? FINGER_COLORS[tipIndex] : "#00dc82";
    overlayCtx.fill();
  });
}

// A finger is "up" when its tip is above its lower joint (in image space).
// The thumb extends sideways, so compare x relative to handedness instead.
function countFingersUp(landmarks, handedness) {
  let count = 0;

  const thumbTip = landmarks[THUMB_TIP];
  const thumbJoint = landmarks[FINGER_PIPS[0]];
  // The video is mirrored in CSS, but landmark coords are unmirrored,
  // so "Right" hand thumb points toward smaller x.
  if (handedness === "Right" ? thumbTip.x < thumbJoint.x : thumbTip.x > thumbJoint.x) {
    count++;
  }

  for (let f = 1; f < 5; f++) {
    if (landmarks[FINGER_TIPS[f]].y < landmarks[FINGER_PIPS[f]].y) count++;
  }
  return count;
}

function nameGesture(fingersUp) {
  switch (fingersUp) {
    case 0: return "Fist ✊";
    case 1: return "Point ☝️";
    case 2: return "Peace ✌️";
    case 5: return "Open hand 🖐";
    default: return `${fingersUp} fingers`;
  }
}

function updateFps() {
  const now = performance.now();
  const fps = 1000 / (now - lastFrameTime);
  lastFrameTime = now;
  fpsEl.textContent = Math.round(fps);
}

init().catch((err) => {
  loading.textContent =
    err.name === "NotAllowedError"
      ? "Camera access was denied. Allow camera permission and reload."
      : `Failed to start: ${err.message}`;
  console.error(err);
});
