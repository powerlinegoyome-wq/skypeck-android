/**
 * SkyPeck 1080p Native Android TV Flight Game Engine
 * Self-contained offline build for Xiaomi Mi TV Stick (Mali-G31 GPU)
 */

// DOM Elements
const canvas = document.getElementById('game-canvas');
const skeletonCanvas = document.getElementById('skeleton-canvas');
const skelCtx = skeletonCanvas.getContext('2d');
const tvStatusBadge = document.getElementById('tv-status');
const pairingOverlay = document.getElementById('pairing-overlay');
const appleScoreText = document.getElementById('apple-score');
const gateDistText = document.getElementById('gate-distance');
const recTimeText = document.getElementById('rec-time');
const fpsMeterText = document.getElementById('fps-meter');
const gateBanner = document.getElementById('gate-banner');
const flightSpeedText = document.getElementById('flight-speed');
const flightAltText = document.getElementById('flight-alt');
const flightModeText = document.getElementById('flight-mode');
const pairingIpText = document.getElementById('pairing-ip');

function updateTvIpDisplay() {
  if (window.SkyPeckBridge && typeof window.SkyPeckBridge.getTvIp === 'function') {
    const ip = window.SkyPeckBridge.getTvIp();
    if (ip && pairingIpText) {
      pairingIpText.innerHTML = `TV IP: <b style="color:#00e5ff;">${ip}</b> (Port 9876)`;
    }
  }
}
setTimeout(updateTvIpDisplay, 200);
setTimeout(updateTvIpDisplay, 1000);

// Dynamic 1080p Screen Fitting for Android TV
function resizeViewport() {
  const targetW = 1920;
  const targetH = 1080;
  const currentW = window.innerWidth || document.documentElement.clientWidth || 1920;
  const currentH = window.innerHeight || document.documentElement.clientHeight || 1080;

  const scaleX = currentW / targetW;
  const scaleY = currentH / targetH;
  const scale = Math.min(scaleX, scaleY);

  const vp = document.getElementById('tv-viewport');
  if (vp) {
    vp.style.transform = `scale(${scale})`;
    const offsetX = (currentW - targetW * scale) / 2;
    const offsetY = (currentH - targetH * scale) / 2;
    vp.style.left = `${offsetX}px`;
    vp.style.top = `${offsetY}px`;
  }
}

window.addEventListener('resize', resizeViewport);
window.addEventListener('orientationchange', resizeViewport);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', resizeViewport);
} else {
  resizeViewport();
}
setTimeout(resizeViewport, 100);
setTimeout(resizeViewport, 500);

// --- 1080p THREE.JS SCENE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8e1f2); // Painterly sky blue
scene.fog = new THREE.FogExp2(0xb8e1f2, 0.002);

const camera = new THREE.PerspectiveCamera(65, 1920 / 1080, 0.5, 4500);
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(1920, 1080, false);
renderer.setPixelRatio(1.0); // Exact 1080p pixel mapping on Mi Stick
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.8);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.position.set(250, 450, 180);
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x2a9d8f, 0.45);
scene.add(hemiLight);

// --- PROCEDURAL AUDIO SYNTHESIZER ---
let audioCtx = null;
let windGain = null;
let windFilter = null;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Ambient Wind Stream
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    windFilter = audioCtx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 400;
    windFilter.Q.value = 1.2;

    windGain = audioCtx.createGain();
    windGain.gain.value = 0.05;

    whiteNoise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(audioCtx.destination);
    whiteNoise.start();
  } catch (e) {}
}

function playFlapSound() {
  initAudio();
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, audioCtx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {}
}

function playGateChime() {
  initAudio();
  if (!audioCtx) return;
  try {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const startTime = audioCtx.currentTime + idx * 0.06;
      gain.gain.setValueAtTime(0.28, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  } catch (e) {}
}

function playAppleDing() {
  initAudio();
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.18);
  } catch (e) {}
}

// --- LOW-POLY PARROT 3D CHARACTER ---
const parrotGroup = new THREE.Group();

const matBody = new THREE.MeshLambertMaterial({ color: 0x00d284 });
const matWing = new THREE.MeshLambertMaterial({ color: 0x00a8ff });
const matWingTip = new THREE.MeshLambertMaterial({ color: 0xffd32a });
const matBeak = new THREE.MeshLambertMaterial({ color: 0xff9f1a });
const matBelly = new THREE.MeshLambertMaterial({ color: 0xff4757 });
const matEye = new THREE.MeshBasicMaterial({ color: 0x1e272e });

// Body
const bodyGeom = new THREE.ConeGeometry(0.75, 2.3, 7);
bodyGeom.rotateX(Math.PI / 2);
const bodyMesh = new THREE.Mesh(bodyGeom, matBody);
parrotGroup.add(bodyMesh);

// Belly
const bellyGeom = new THREE.SphereGeometry(0.58, 6, 6);
bellyGeom.scale(0.8, 1.2, 0.6);
bellyGeom.rotateX(Math.PI / 2.5);
const bellyMesh = new THREE.Mesh(bellyGeom, matBelly);
bellyMesh.position.set(0, -0.15, 0.22);
parrotGroup.add(bellyMesh);

// Head & Beak
const headGroup = new THREE.Group();
headGroup.position.set(0, 0.48, 1.05);
const headMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 1), matBody);
headGroup.add(headMesh);

const beakGeom = new THREE.ConeGeometry(0.24, 0.65, 5);
beakGeom.rotateX(Math.PI / 2.3);
const beakMesh = new THREE.Mesh(beakGeom, matBeak);
beakMesh.position.set(0, -0.1, 0.58);
headGroup.add(beakMesh);

const eyeGeom = new THREE.SphereGeometry(0.09, 5, 5);
const leftEye = new THREE.Mesh(eyeGeom, matEye);
leftEye.position.set(-0.36, 0.12, 0.28);
const rightEye = new THREE.Mesh(eyeGeom, matEye);
rightEye.position.set(0.36, 0.12, 0.28);
headGroup.add(leftEye, rightEye);
parrotGroup.add(headGroup);

// Left Wing
const leftWingPivot = new THREE.Group();
leftWingPivot.position.set(-0.5, 0.1, 0.2);
const leftWingRootGeom = new THREE.BoxGeometry(1.6, 0.08, 0.9);
leftWingRootGeom.translate(-0.8, 0, 0);
leftWingPivot.add(new THREE.Mesh(leftWingRootGeom, matWing));

const leftWingTipPivot = new THREE.Group();
leftWingTipPivot.position.set(-1.6, 0, 0);
const leftWingTipGeom = new THREE.ConeGeometry(0.45, 1.4, 4);
leftWingTipGeom.rotateZ(Math.PI / 2);
leftWingTipGeom.translate(-0.7, 0, 0);
leftWingTipPivot.add(new THREE.Mesh(leftWingTipGeom, matWingTip));
leftWingPivot.add(leftWingTipPivot);
parrotGroup.add(leftWingPivot);

// Right Wing
const rightWingPivot = new THREE.Group();
rightWingPivot.position.set(0.5, 0.1, 0.2);
const rightWingRootGeom = new THREE.BoxGeometry(1.6, 0.08, 0.9);
rightWingRootGeom.translate(0.8, 0, 0);
rightWingPivot.add(new THREE.Mesh(rightWingRootGeom, matWing));

const rightWingTipPivot = new THREE.Group();
rightWingTipPivot.position.set(1.6, 0, 0);
const rightWingTipGeom = new THREE.ConeGeometry(0.45, 1.4, 4);
rightWingTipGeom.rotateZ(-Math.PI / 2);
rightWingTipGeom.translate(0.7, 0, 0);
rightWingTipPivot.add(new THREE.Mesh(rightWingTipGeom, matWingTip));
rightWingPivot.add(rightWingTipPivot);
parrotGroup.add(rightWingPivot);

// Tail Feathers
const tailGroup = new THREE.Group();
tailGroup.position.set(0, 0.1, -1.1);
const tailGeom = new THREE.BoxGeometry(0.55, 0.06, 1.7);
tailGeom.translate(0, 0, -0.75);
tailGroup.add(new THREE.Mesh(tailGeom, matWing));
parrotGroup.add(tailGroup);

scene.add(parrotGroup);

// --- ARCHIPELAGO WORLD ---
const oceanGeom = new THREE.PlaneGeometry(4200, 4200, 64, 64);
oceanGeom.rotateX(-Math.PI / 2);
const oceanMat = new THREE.MeshLambertMaterial({
  color: 0x0096c7,
  flatShading: true,
  transparent: true,
  opacity: 0.88,
});
const oceanMesh = new THREE.Mesh(oceanGeom, oceanMat);
scene.add(oceanMesh);

const oceanOriginalY = new Float32Array(oceanGeom.attributes.position.count);
for (let i = 0; i < oceanOriginalY.length; i++) oceanOriginalY[i] = oceanGeom.attributes.position.getY(i);

// 3D Volumetric Clouds
const cloudsGroup = new THREE.Group();
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, opacity: 0.94, transparent: true });

function createCloud(x, y, z, scale = 1.0) {
  const cloud = new THREE.Group();
  cloud.position.set(x, y, z);
  const puffGeom = new THREE.DodecahedronGeometry(8 * scale, 1);
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(puffGeom, cloudMat);
    puff.position.set((Math.random() - 0.5) * 20 * scale, (Math.random() - 0.5) * 6 * scale, (Math.random() - 0.5) * 14 * scale);
    puff.scale.set(0.7 + Math.random() * 0.6, 0.6 + Math.random() * 0.4, 0.7 + Math.random() * 0.6);
    cloud.add(puff);
  }
  cloudsGroup.add(cloud);
}

for (let c = 0; c < 28; c++) {
  createCloud((Math.random() - 0.5) * 750, 70 + Math.random() * 80, -Math.random() * 3400, 0.8 + Math.random() * 0.5);
}
scene.add(cloudsGroup);

// Distant Horizon Mountain Silhouettes
function createDistantMountain(x, z, r, h) {
  const mtnGeom = new THREE.ConeGeometry(r, h, 7, 2);
  const mtnMat = new THREE.MeshLambertMaterial({ color: 0x4a6b82, flatShading: true });
  const mtn = new THREE.Mesh(mtnGeom, mtnMat);
  mtn.position.set(x, h / 2 - 5, z);
  scene.add(mtn);
}
createDistantMountain(-950, -3300, 340, 260);
createDistantMountain(900, -3600, 400, 310);
createDistantMountain(0, -4200, 500, 380);

// Multi-Layered Archipelago Islands
const matSand = new THREE.MeshLambertMaterial({ color: 0xf4a261, flatShading: true });
const matGrass = new THREE.MeshLambertMaterial({ color: 0x2a9d8f, flatShading: true });
const matCliff = new THREE.MeshLambertMaterial({ color: 0x6d597a, flatShading: true });

function createRichIsland(x, z, radius, height) {
  const island = new THREE.Group();
  island.position.set(x, 0, z);

  // Sand Base
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius * 1.08, 12, 10), matSand);
  sand.position.y = 4;
  island.add(sand);

  // Grass Plateau
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.45, radius * 0.85, height, 9), matGrass);
  grass.position.y = height / 2 + 5;
  island.add(grass);

  // Cliff Peak
  if (height > 40) {
    const cliff = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.35, height * 0.6, 6), matCliff);
    cliff.position.y = height + height * 0.25;
    island.add(cliff);
  }
  scene.add(island);

  // Trees
  for (let t = 0; t < 8; t++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius * 0.65;
    createPalmTree(x + Math.cos(angle) * dist, height + 5, z + Math.sin(angle) * dist);
  }
}

function createPalmTree(x, y, z) {
  const tree = new THREE.Group();
  tree.position.set(x, y, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 7.5, 5), new THREE.MeshLambertMaterial({ color: 0x9c6644, flatShading: true }));
  trunk.position.y = 3.5;
  tree.add(trunk);

  const leafMat = new THREE.MeshLambertMaterial({ color: 0x52b788, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.5, 4), leafMat);
    leaf.rotateX(Math.PI / 2.8);
    leaf.position.y = 7.0;
    leaf.rotation.y = (i * Math.PI * 2) / 6;
    tree.add(leaf);
  }
  scene.add(tree);
}

// Sea Arch & Floating Island
function createSeaArch(x, z, width, height) {
  const arch = new THREE.Group();
  arch.position.set(x, 0, z);
  const archMesh = new THREE.Mesh(new THREE.TorusGeometry(width * 0.5, 4.5, 6, 12, Math.PI), matCliff);
  archMesh.position.y = height;
  arch.add(archMesh);
  scene.add(arch);
}

function createFloatingIsland(x, y, z) {
  const floatGroup = new THREE.Group();
  floatGroup.position.set(x, y, z);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(14, 18, 6), matCliff);
  rock.rotateX(Math.PI);
  floatGroup.add(rock);

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(4, 0), new THREE.MeshBasicMaterial({ color: 0x00f5d4 }));
  crystal.scale.set(0.8, 2.2, 0.8);
  crystal.position.y = 8;
  floatGroup.add(crystal);
  scene.add(floatGroup);
}

createRichIsland(0, -280, 85, 40);
createRichIsland(150, -680, 95, 55);
createSeaArch(70, -850, 48, 38);
createRichIsland(-140, -1200, 120, 75);
createFloatingIsland(40, 80, -1450);
createRichIsland(110, -1750, 105, 50);
createRichIsland(-80, -2300, 135, 85);
createRichIsland(40, -2900, 150, 100);

// --- CHECKPOINT RINGS (GATES) ---
const gateWaypoints = [
  { x: 0, y: 35, z: -180, label: 'Gate 1!' },
  { x: 45, y: 48, z: -420, label: 'Gate 2!' },
  { x: 70, y: 40, z: -850, label: 'Arch Gate 3!' },
  { x: 120, y: 62, z: -1050, label: 'Gate 4!' },
  { x: 40, y: 82, z: -1450, label: 'Crystal Gate 5!' },
  { x: -100, y: 65, z: -1800, label: 'Gate 6!' },
  { x: 0, y: 50, z: -2150, label: 'Gate 7!' },
  { x: 75, y: 68, z: -2500, label: 'Gate 8!' },
  { x: -30, y: 82, z: -2850, label: 'Gate 9!' },
  { x: 40, y: 95, z: -3200, label: 'Victory Gate!' },
];

const ringMeshList = [];
const ringTorusGeom = new THREE.TorusGeometry(8.5, 0.7, 8, 24);
const ringMatActive = new THREE.MeshBasicMaterial({ color: 0xffd600 });
const ringMatPassed = new THREE.MeshBasicMaterial({ color: 0x00e676 });

gateWaypoints.forEach((wp, idx) => {
  const ringGroup = new THREE.Group();
  ringGroup.position.set(wp.x, wp.y, wp.z);
  const torus = new THREE.Mesh(ringTorusGeom, idx === 0 ? ringMatActive : ringMatActive.clone());
  ringGroup.add(torus);
  scene.add(ringGroup);
  ringMeshList.push({ group: ringGroup, torus: torus, passed: false, wp: wp });
});

let currentGateIndex = 0;

// Apples Collectibles
const appleList = [];
const appleGeom = new THREE.SphereGeometry(1.0, 6, 6);
const appleMat = new THREE.MeshLambertMaterial({ color: 0xff3838 });

for (let i = 0; i < 30; i++) {
  const t = i / 30;
  const segIdx = Math.min(gateWaypoints.length - 2, Math.floor(t * (gateWaypoints.length - 1)));
  const p1 = gateWaypoints[segIdx];
  const p2 = gateWaypoints[segIdx + 1];
  const segT = (t * (gateWaypoints.length - 1)) % 1;

  const apple = new THREE.Mesh(appleGeom, appleMat);
  apple.position.set(
    p1.x + (p2.x - p1.x) * segT + (Math.random() - 0.5) * 16,
    p1.y + (p2.y - p1.y) * segT + (Math.random() - 0.5) * 8,
    p1.z + (p2.z - p1.z) * segT
  );
  scene.add(apple);
  appleList.push({ mesh: apple, collected: false });
}

let applesCollected = 0;

// --- FLIGHT STATE ---
const flight = {
  pos: new THREE.Vector3(0, 35, 0),
  speed: 18.0,
  yaw: 0,
  roll: 0,
  pitch: 0,
  wingFlapPhase: 0,
  flapVelocity: 0,
  isDiving: false,
};

let lastFlapSoundTime = 0;
function triggerFlap(power = 0.85) {
  flight.flapVelocity = Math.max(flight.flapVelocity, power * 15.0);
  flight.speed = Math.min(34.0, flight.speed + power * 4.0);
  const now = performance.now();
  if (now - lastFlapSoundTime > 250) {
    playFlapSound();
    lastFlapSoundTime = now;
  }
}

// --- NATIVE ANDROID UDP & CONTROLLER HOOKS ---
let lastPacketTime = 0;
let lastProcessedJson = "";

function processTelemetryPacket(jsonString) {
  try {
    let packet = jsonString;
    if (typeof jsonString === 'string') {
      const sanitized = jsonString.replace(/(\d),(\d)/g, '$1.$2');
      packet = JSON.parse(sanitized);
    }
    lastPacketTime = performance.now();
    tvStatusBadge.textContent = 'PHONE LINKED';
    tvStatusBadge.className = 'status-badge linked';
    pairingOverlay.classList.add('hidden');

    if (typeof packet.roll === 'number') {
      flight.roll = flight.roll * 0.25 + packet.roll * 0.75;
    }
    if (typeof packet.flap === 'number' && packet.flap > 0.18) {
      triggerFlap(packet.flap);
    }
    flight.isDiving = !!packet.dive;

    if (Array.isArray(packet.skel)) {
      drawSkeletonHUD(packet.skel);
    }
  } catch (e) {}
}

// Called by Android Kotlin Native UDP Server (Legacy fallback)
window.onUdpTelemetry = processTelemetryPacket;

// Called by TV Remote DPAD:
window.onRemoteKey = function(action) {
  initAudio();
  if (action === 'FLAP' || action === 'CENTER' || action === 'ENTER') {
    triggerFlap(0.85);
  } else if (action === 'LEFT') {
    flight.roll = Math.max(-1.0, flight.roll - 0.3);
  } else if (action === 'RIGHT') {
    flight.roll = Math.min(1.0, flight.roll + 0.3);
  } else if (action === 'DOWN') {
    flight.isDiving = true;
  }
};

// Keyboard listener for testing
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') triggerFlap(0.85);
  if (e.key === 'ArrowLeft') flight.roll = Math.max(-1.0, flight.roll - 0.2);
  if (e.key === 'ArrowRight') flight.roll = Math.min(1.0, flight.roll + 0.2);
  if (e.key === 'ArrowDown') flight.isDiving = true;
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowDown') flight.isDiving = false;
});

// Skeleton HUD Drawing (Optimized for Mali-G31 GPU without costly shadow blur)
function drawSkeletonHUD(skel) {
  const w = skeletonCanvas.width;
  const h = skeletonCanvas.height;
  skelCtx.clearRect(0, 0, w, h);

  const p = (idx) => (skel[idx] ? { x: (1.0 - skel[idx][0]) * w, y: skel[idx][1] * h } : { x: 0, y: 0 });
  const connections = [[1, 2], [1, 3], [3, 5], [2, 4], [4, 6], [1, 7], [2, 8], [7, 8], [0, 1], [0, 2]];

  skelCtx.strokeStyle = '#00e5ff';
  skelCtx.lineWidth = 3.0;

  connections.forEach(([i, j]) => {
    const p1 = p(i);
    const p2 = p(j);
    skelCtx.beginPath();
    skelCtx.moveTo(p1.x, p1.y);
    skelCtx.lineTo(p2.x, p2.y);
    skelCtx.stroke();
  });

  skelCtx.fillStyle = '#ffd600';
  for (let i = 0; i < skel.length; i++) {
    const pt = p(i);
    skelCtx.beginPath();
    skelCtx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
    skelCtx.fill();
  }
}

// --- 1080p GAME LOOP ---
let lastTime = performance.now();
let fpsCount = 0;
let fpsTimer = performance.now();
let startTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.08, (now - lastTime) / 1000.0);
  lastTime = now;

  // Poll Native Kotlin UDP Bridge (Zero-overhead direct shared memory polling)
  if (window.SkyPeckBridge && typeof window.SkyPeckBridge.getTelemetry === 'function') {
    const raw = window.SkyPeckBridge.getTelemetry();
    if (raw && raw.length > 5 && raw !== lastProcessedJson) {
      lastProcessedJson = raw;
      processTelemetryPacket(raw);
    }
  }

  // Connection Watchdog
  if (lastPacketTime > 0 && now - lastPacketTime > 2500) {
    tvStatusBadge.textContent = 'WAITING PHONE';
    tvStatusBadge.className = 'status-badge waiting';
  }
  // Gradual roll recentering when no controller input
  if (lastPacketTime > 0 && now - lastPacketTime > 400) {
    flight.roll *= 0.95;
  }

  // FPS Meter
  fpsCount++;
  if (now - fpsTimer >= 1000) {
    fpsMeterText.textContent = `${fpsCount} FPS`;
    fpsCount = 0;
    fpsTimer = now;
  }

  // REC Timer
  const elapsed = Math.floor((now - startTime) / 1000);
  recTimeText.textContent = `REC ${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;

  // Flight Physics
  flight.yaw += -flight.roll * 1.6 * dt;

  let targetPitch = -0.04;
  if (flight.isDiving) {
    targetPitch = 0.45;
    flight.speed = Math.min(34.0, flight.speed + dt * 12.0);
    flightModeText.textContent = 'DIVING';
    flightModeText.className = 'flight-value mode-dive';
  } else {
    flight.speed = flight.speed * 0.985 + 18.0 * 0.015;
    flightModeText.textContent = 'GLIDING';
    flightModeText.className = 'flight-value mode-glide';
  }

  if (flight.flapVelocity > 0) {
    targetPitch = -0.32;
    flight.pos.y += flight.flapVelocity * dt;
    flight.flapVelocity = Math.max(0, flight.flapVelocity - dt * 22.0);
  } else if (!flight.isDiving) {
    flight.pos.y -= 1.8 * dt;
  } else {
    flight.pos.y -= 9.5 * dt;
  }

  if (flight.pos.y < 5.0) flight.pos.y = 5.0;

  flight.pitch = flight.pitch * 0.8 + targetPitch * 0.2;
  const fX = -Math.sin(flight.yaw);
  const fZ = -Math.cos(flight.yaw);

  flight.pos.x += fX * flight.speed * dt;
  flight.pos.z += fZ * flight.speed * dt;

  // Parrot Transform
  parrotGroup.position.copy(flight.pos);
  parrotGroup.rotation.set(flight.pitch, flight.yaw, -flight.roll * 0.75);

  flight.wingFlapPhase += dt * (flight.flapVelocity > 0 ? 24.0 : 4.0);
  const flapAngle = Math.sin(flight.wingFlapPhase) * (flight.flapVelocity > 0 ? 0.75 : 0.12);

  if (flight.isDiving) {
    leftWingPivot.rotation.set(0.4, 0.8, -0.3);
    rightWingPivot.rotation.set(0.4, -0.8, 0.3);
  } else {
    leftWingPivot.rotation.set(0, 0, flapAngle);
    rightWingPivot.rotation.set(0, 0, -flapAngle);
  }

  // Camera Follow (1080p framing)
  const camTarget = new THREE.Vector3(flight.pos.x - fX * 9.5, flight.pos.y + 3.8, flight.pos.z - fZ * 9.5);
  camera.position.lerp(camTarget, 0.12);
  camera.lookAt(flight.pos.x, flight.pos.y + 1.2, flight.pos.z);

  // Animate Waves & Clouds
  cloudsGroup.children.forEach((c) => {
    c.position.x += dt * 2.0;
    if (c.position.x > 380) c.position.x = -380;
  });

  const tNow = now * 0.0018;
  const oPos = oceanGeom.attributes.position;
  for (let i = 0; i < oPos.count; i += 2) {
    const px = oPos.getX(i);
    const pz = oPos.getZ(i);
    oPos.setY(i, oceanOriginalY[i] + Math.sin(px * 0.02 + tNow) * 1.5 + Math.cos(pz * 0.025 + tNow * 1.3) * 1.2);
  }
  oPos.needsUpdate = true;

  // Update HUD
  flightSpeedText.textContent = `${Math.round(flight.speed * 3.6)} km/h`;
  flightAltText.textContent = `${Math.round(flight.pos.y)} m`;

  if (currentGateIndex < gateWaypoints.length) {
    const activeGate = gateWaypoints[currentGateIndex];
    const dist = Math.round(flight.pos.distanceTo(new THREE.Vector3(activeGate.x, activeGate.y, activeGate.z)));
    gateDistText.textContent = `${dist} m`;

    if (dist < 11.0) {
      playGateChime();
      gateBanner.querySelector('.gate-title').textContent = activeGate.label;
      gateBanner.classList.remove('hidden');
      setTimeout(() => gateBanner.classList.add('hidden'), 1800);

      ringMeshList[currentGateIndex].torus.material = ringMatPassed;
      currentGateIndex++;
      if (currentGateIndex < ringMeshList.length) ringMeshList[currentGateIndex].torus.material = ringMatActive;
    }
  }

  appleList.forEach((item) => {
    if (!item.collected && flight.pos.distanceTo(item.mesh.position) < 4.5) {
      item.collected = true;
      scene.remove(item.mesh);
      applesCollected++;
      appleScoreText.textContent = `${applesCollected} / 30`;
      playAppleDing();
    }
  });

  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', animate);
