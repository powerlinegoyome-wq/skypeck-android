/**
 * SkyPeck Mobile Edge-AI Motion Tracker
 * Runs real-time MediaPipe Pose detection and extracts flight kinematics.
 */

// DOM Elements
const videoEl = document.getElementById('input-video');
const canvasEl = document.getElementById('output-canvas');
const canvasCtx = canvasEl.getContext('2d');
const netStatusBadge = document.getElementById('net-status');
const fpsBadge = document.getElementById('fps-badge');
const rollBar = document.getElementById('roll-bar');
const rollVal = document.getElementById('roll-val');
const flapBar = document.getElementById('flap-bar');
const flapVal = document.getElementById('flap-val');
const diveIndicator = document.getElementById('dive-indicator');
const dashIndicator = document.getElementById('dash-indicator');
const glideIndicator = document.getElementById('glide-indicator');
const guidanceOverlay = document.getElementById('guidance-overlay');

// Controls & Settings Elements
const btnCamToggle = document.getElementById('btn-camera-toggle');
const btnCalibrate = document.getElementById('btn-calibrate');
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const serverHostInput = document.getElementById('server-host');
const rollSensInput = document.getElementById('roll-sens');
const rollSensVal = document.getElementById('roll-sens-val');
const flapSensInput = document.getElementById('flap-sens');
const flapSensVal = document.getElementById('flap-sens-val');
const smoothingInput = document.getElementById('smoothing');
const smoothingVal = document.getElementById('smoothing-val');
const invertRollCheckbox = document.getElementById('invert-roll');
const audioFeedbackCheckbox = document.getElementById('audio-feedback');

// State Variables
let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)
let ws = null;
let isConnected = false;
let frameCount = 0;
let lastFpsTime = performance.now();
let currentFps = 0;

// Kinematics Configuration & Filter State
const config = {
  serverHost: window.location.host,
  rollSensitivity: 1.2,
  flapSensitivity: 1.5,
  smoothing: 0.6, // Higher = smoother, lower = snappier
  invertRoll: false,
  audioFeedback: true,
};

// Flight Telemetry State
let restingAngle = 0; // Calibration offset
let smoothedRoll = 0;
let smoothedPitch = 0;
let flapPower = 0;
let isDiving = false;
let isDashing = false;

let lastWristY = null;
let lastWristTime = performance.now();
let lastFlapTriggerTime = 0;

// Web Audio API Synth for Flap Whoosh
let audioCtx = null;
function playFlapSound() {
  if (!config.audioFeedback) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, audioCtx.currentTime + 0.18);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } catch (e) {
    // Audio might require user interaction first
  }
}

// Initialize Settings Inputs
serverHostInput.value = config.serverHost;
rollSensInput.addEventListener('input', () => {
  config.rollSensitivity = parseFloat(rollSensInput.value);
  rollSensVal.textContent = `${config.rollSensitivity.toFixed(1)}x`;
});
flapSensInput.addEventListener('input', () => {
  config.flapSensitivity = parseFloat(flapSensInput.value);
  flapSensVal.textContent = `${config.flapSensitivity.toFixed(1)}x`;
});
smoothingInput.addEventListener('input', () => {
  config.smoothing = parseFloat(smoothingInput.value);
  smoothingVal.textContent = config.smoothing.toFixed(2);
});
invertRollCheckbox.addEventListener('change', () => {
  config.invertRoll = invertRollCheckbox.checked;
});
audioFeedbackCheckbox.addEventListener('change', () => {
  config.audioFeedback = audioFeedbackCheckbox.checked;
});

btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
btnSaveSettings.addEventListener('click', () => {
  const newHost = serverHostInput.value.trim();
  if (newHost && newHost !== config.serverHost) {
    config.serverHost = newHost;
    connectWebSocket();
  }
  settingsModal.classList.add('hidden');
});

// Calibration / Zero Tilt
btnCalibrate.addEventListener('click', () => {
  // Use current smoothed roll as new zero offset
  restingAngle += smoothedRoll;
  btnCalibrate.textContent = '✓ Zeroed';
  setTimeout(() => {
    btnCalibrate.innerHTML = '<span class="icon">🎯</span> Zero Tilt';
  }, 1200);
});

// Switch Camera
btnCamToggle.addEventListener('click', async () => {
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  // Adjust canvas mirror transform based on facing mode
  canvasEl.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
  await startCamera();
});

// WebSocket Connection
function connectWebSocket() {
  if (ws) {
    try { ws.close(); } catch (e) {}
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const targetHost = config.serverHost || window.location.host;
  const wsUrl = `${protocol}//${targetHost}/ws/phone`;

  netStatusBadge.textContent = 'Connecting...';
  netStatusBadge.className = 'badge badge-disconnected';

  try {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      isConnected = true;
      netStatusBadge.textContent = 'Live Connected';
      netStatusBadge.className = 'badge badge-connected';
    };

    ws.onclose = () => {
      isConnected = false;
      netStatusBadge.textContent = 'Disconnected';
      netStatusBadge.className = 'badge badge-disconnected';
      // Reconnect after 2 seconds
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => {
      isConnected = false;
      netStatusBadge.textContent = 'Net Error';
      netStatusBadge.className = 'badge badge-disconnected';
    };
  } catch (err) {
    console.warn('WS Init Error:', err);
    setTimeout(connectWebSocket, 3000);
  }
}

// MediaPipe Pose Setup
const pose = new Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
});

pose.setOptions({
  modelComplexity: 0, // 0 = Blazepose Lite (optimized for mobile)
  smoothLandmarks: false, // Turn off WASM internal filter to save CPU
  enableSegmentation: false,
  smoothSegmentation: false,
  minDetectionConfidence: 0.35,
  minTrackingConfidence: 0.35,
});

pose.onResults(onPoseResults);

// Offscreen Low-Res Fast Canvas for Exynos 850 / Mali-G52
const fastScaleCanvas = document.createElement('canvas');
fastScaleCanvas.width = 256;
fastScaleCanvas.height = 192;
const fastScaleCtx = fastScaleCanvas.getContext('2d', { willReadFrequently: true });

// Start Camera Stream
let mediaStream = null;
async function startCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }

  // 1. Check for Secure Context / MediaDevices availability
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const isHttps = window.location.protocol === 'https:';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (!isHttps && !isLocalhost) {
      const httpsUrl = `https://${window.location.hostname}:8443${window.location.pathname}`;
      guidanceOverlay.innerHTML = `
        <div class="guidance-card" style="border-color: #ffd600; flex-direction: column; text-align: center; padding: 16px; max-width: 320px;">
          <div class="guidance-icon">🔒</div>
          <div class="guidance-text" style="font-weight: 700; font-size: 0.9rem; margin-bottom: 6px; color: #ffd600;">Kamera İçin HTTPS Gerekli</div>
          <div style="font-size: 0.76rem; color: #cfd8dc; margin-bottom: 12px; line-height: 1.4;">
            Chrome ve Android güvenlik politikası gereği kamera izni yalnızca <b>HTTPS</b> adresinde sorulabilir.
          </div>
          <a href="${httpsUrl}" class="btn btn-primary" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 10px 16px; font-size: 0.85rem; font-weight: 700; border-radius: 8px;">
            HTTPS'e Geç & İzin Ver ➜
          </a>
          <div style="font-size: 0.68rem; color: #8899a6; margin-top: 8px;">
            (Açılan sayfada 'Gelişmiş -> Siteye İlerle' deyin)
          </div>
        </div>
      `;
      return;
    }
  }

  // 320x240 low-resolution constraints for 4x faster processing on Galaxy A12 (Exynos 850)
  const constraints = {
    audio: false,
    video: {
      facingMode: currentFacingMode,
      width: { ideal: 320, max: 480 },
      height: { ideal: 240, max: 360 },
      frameRate: { ideal: 30, max: 30 },
    },
  };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = mediaStream;
    await videoEl.play();

    canvasEl.width = videoEl.videoWidth || 320;
    canvasEl.height = videoEl.videoHeight || 240;

    guidanceOverlay.innerHTML = `
      <div class="guidance-card">
        <div class="guidance-icon">👐</div>
        <div class="guidance-text">Kamera açıldı! Kollarınızı kanat gibi açarak uçun.</div>
      </div>
    `;
    setTimeout(() => {
      guidanceOverlay.style.opacity = '0';
    }, 2500);

    requestVideoFrame();
  } catch (err) {
    console.error('Camera access failed:', err);
    guidanceOverlay.innerHTML = `
      <div class="guidance-card" style="border-color: #ff3d00; flex-direction: column; text-align: center; padding: 14px; max-width: 320px;">
        <div class="guidance-icon">📷</div>
        <div class="guidance-text" style="font-weight: 700; color: #ff5252; font-size: 0.9rem;">Kamera İzni Gerekiyor</div>
        <div style="font-size: 0.75rem; color: #cfd8dc; margin: 8px 0 12px 0; line-height: 1.4;">
          Tarayıcı kamera iznini engelledi veya sormadı. Lütfen adres çubuğundaki kilit 🔒 / ayar simgesine tıklayıp <b>Kamera</b> iznini "İzin Ver" yapın.
        </div>
        <button id="btn-retry-camera" class="btn btn-primary" style="width: 100%; padding: 10px 14px; font-size: 0.85rem; font-weight: 700;">
          Tekrar Dene / İzin İste
        </button>
      </div>
    `;
    const retryBtn = document.getElementById('btn-retry-camera');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        startCamera();
      });
    }
  }
}

let isProcessingFrame = false;
async function requestVideoFrame() {
  if (videoEl.readyState >= 2 && !isProcessingFrame) {
    isProcessingFrame = true;
    try {
      // Scale into 256x192 fast canvas before sending to MediaPipe
      fastScaleCtx.drawImage(videoEl, 0, 0, 256, 192);
      await pose.send({ image: fastScaleCanvas });
    } catch (err) {
      console.warn('Pose process error:', err);
    }
    isProcessingFrame = false;
  }
  requestAnimationFrame(requestVideoFrame);
}

// Draw Skeleton on Phone Canvas & Extract Kinematics
function onPoseResults(results) {
  // Update FPS Meter
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    fpsBadge.textContent = `${currentFps} FPS`;
    frameCount = 0;
    lastFpsTime = now;
  }

  // Clear Canvas
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  // Draw dimmed video frame
  canvasCtx.globalAlpha = 0.45;
  canvasCtx.drawImage(results.image, 0, 0, canvasEl.width, canvasEl.height);
  canvasCtx.globalAlpha = 1.0;

  if (!results.poseLandmarks) {
    guidanceOverlay.style.opacity = '1';
    canvasCtx.restore();
    return;
  }

  guidanceOverlay.style.opacity = '0';
  const lm = results.poseLandmarks;

  // Key Joint Indices:
  // 0: Nose, 11: Left Shoulder, 12: Right Shoulder
  // 13: Left Elbow, 14: Right Elbow, 15: Left Wrist, 16: Right Wrist
  // 23: Left Hip, 24: Right Hip
  const nose = lm[0];
  const lShoulder = lm[11];
  const rShoulder = lm[12];
  const lElbow = lm[13];
  const rElbow = lm[14];
  const lWrist = lm[15];
  const rWrist = lm[16];
  const lHip = lm[23];
  const rHip = lm[24];

  // 1. Draw Skeleton Lines (Vibrant Cyan / Yellow Joint Highlights)
  drawSkeleton(canvasCtx, lm);

  // 2. Compute Flight Kinematics
  // Scale-Invariant Measurements relative to player's torso
  const shoulderDist = Math.hypot(rShoulder.x - lShoulder.x, rShoulder.y - lShoulder.y);
  const wristDist = Math.hypot(rWrist.x - lWrist.x, rWrist.y - lWrist.y);
  const wingspanRatio = wristDist / Math.max(0.01, shoulderDist);

  // Roll / Bank Angle (Tilt between left and right wrists)
  let rawAngle = Math.atan2(rWrist.y - lWrist.y, rWrist.x - lWrist.x);
  if (currentFacingMode === 'user') {
    rawAngle = -rawAngle; // Invert for mirrored camera
  }
  if (config.invertRoll) {
    rawAngle = -rawAngle;
  }

  // Slowly adapt resting angle to naturally cancel slight involuntary tilt
  restingAngle += (rawAngle - restingAngle) * 0.002;
  const targetRoll = (rawAngle - restingAngle) * config.rollSensitivity;
  smoothedRoll = smoothedRoll * config.smoothing + targetRoll * (1 - config.smoothing);

  // Clamp Roll to [-1.0, 1.0]
  const clampedRoll = Math.max(-1.0, Math.min(1.0, smoothedRoll));

  // Flap Detection: Vertical wrist velocity relative to shoulders
  const avgWristY = (lWrist.y + rWrist.y) / 2.0;
  const avgShoulderY = (lShoulder.y + rShoulder.y) / 2.0;
  const dt = Math.max(0.001, (now - lastWristTime) / 1000.0);

  if (lastWristY !== null) {
    // In screen coords, positive dY means downward movement (stroke down)
    const wristVelocityY = (avgWristY - lastWristY) / dt;

    // Detect powerful downward flap stroke
    if (wristVelocityY > 0.8 * config.flapSensitivity && now - lastFlapTriggerTime > 220) {
      const flapStrength = Math.min(1.0, (wristVelocityY / 2.5) * config.flapSensitivity);
      flapPower = Math.max(flapPower, flapStrength);
      lastFlapTriggerTime = now;
      playFlapSound();
    }
  }
  lastWristY = avgWristY;
  lastWristTime = now;

  // Flap power decay
  flapPower = Math.max(0, flapPower - dt * 2.8);

  // Dive Detection: Arms tucked into torso
  isDiving = wingspanRatio < 1.05 && avgWristY > avgShoulderY;

  // Dash Detection: Fast forearm rotation / propeller gesture
  const lForearmAngle = Math.atan2(lWrist.y - lElbow.y, lWrist.x - lElbow.x);
  const rForearmAngle = Math.atan2(rWrist.y - rElbow.y, rWrist.x - rElbow.x);
  // Optional dash condition

  // Update UI Gauges
  updateGauges(clampedRoll, flapPower, isDiving, isDashing);

  // 3. Transmit Telemetry Packet over WebSocket to TV
  if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
    const packet = {
      t: Date.now(),
      roll: parseFloat(clampedRoll.toFixed(3)),
      pitch: 0.0,
      flap: parseFloat(flapPower.toFixed(2)),
      dive: isDiving,
      dash: isDashing,
      skel: [
        [nose.x, nose.y],
        [lShoulder.x, lShoulder.y],
        [rShoulder.x, rShoulder.y],
        [lElbow.x, lElbow.y],
        [rElbow.x, rElbow.y],
        [lWrist.x, lWrist.y],
        [rWrist.x, rWrist.y],
        [lHip.x, lHip.y],
        [rHip.x, rHip.y],
      ],
    };
    ws.send(JSON.stringify(packet));
  }

  canvasCtx.restore();
}

// Update On-Screen Flight Gauges
function updateGauges(roll, flap, dive, dash) {
  // Roll bar: 50% is center (0°), 0% is left (-1), 100% is right (+1)
  const rollPercent = 50 + roll * 45;
  rollBar.style.width = `${rollPercent}%`;
  rollVal.textContent = `${Math.round(roll * 45)}°`;

  // Flap bar: 0% to 100%
  const flapPercent = Math.min(100, Math.round(flap * 100));
  flapBar.style.width = `${flapPercent}%`;
  flapVal.textContent = `${flapPercent}%`;

  // State indicators
  if (dive) {
    diveIndicator.classList.add('active');
    glideIndicator.classList.remove('active');
  } else {
    diveIndicator.classList.remove('active');
    glideIndicator.classList.add('active');
  }

  if (dash) {
    dashIndicator.classList.add('active');
  } else {
    dashIndicator.classList.remove('active');
  }
}

// Draw Styled Skeleton Overlay matching SkyPeck
function drawSkeleton(ctx, lm) {
  const w = canvasEl.width;
  const h = canvasEl.height;

  // Helper to get pixel coords
  const p = (idx) => ({ x: lm[idx].x * w, y: lm[idx].y * h });

  const connections = [
    [11, 12], // Shoulders
    [11, 13], [13, 15], // Left Arm
    [12, 14], [14, 16], // Right Arm
    [11, 23], [12, 24], // Torso sides
    [23, 24], // Hips
    [0, 11], [0, 12], // Neck to shoulders
  ];

  // Draw glowing cyan lines
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 8;

  connections.forEach(([i, j]) => {
    const pt1 = p(i);
    const pt2 = p(j);
    ctx.beginPath();
    ctx.moveTo(pt1.x, pt1.y);
    ctx.lineTo(pt2.x, pt2.y);
    ctx.stroke();
  });

  // Draw joints (yellow circular nodes)
  const jointIndices = [0, 11, 12, 13, 14, 15, 16, 23, 24];
  ctx.fillStyle = '#ffd600';
  ctx.shadowColor = '#ffd600';
  ctx.shadowBlur = 6;

  jointIndices.forEach((idx) => {
    const pt = p(idx);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI);
    ctx.fill();
  });

  ctx.shadowBlur = 0;
}

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  startCamera();
});
