import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#game-canvas");
const startScreen = document.querySelector("#start-screen");
const pausePanel = document.querySelector("#pause-panel");
const gameOverPanel = document.querySelector("#game-over");
const hud = document.querySelector("#hud");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const resumeButton = document.querySelector("#resume-button");
const pauseButton = document.querySelector("#pause-button");
const muteButton = document.querySelector("#mute-button");
const scoreText = document.querySelector("#score");
const speedText = document.querySelector("#speed");
const finalScore = document.querySelector("#final-score");
const healthBar = document.querySelector("#health-bar");
const boostBar = document.querySelector("#boost-bar");
const toast = document.querySelector("#toast");
const touchControls = document.querySelector("#touch-controls");
const touchButtons = [...document.querySelectorAll("[data-control]")];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070411);
scene.fog = new THREE.Fog(0x070411, 34, 235);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 7.2, 16);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const palette = {
  ink: 0x070411,
  asphalt: 0x17121f,
  shoulder: 0x251132,
  cyan: 0x19f7ff,
  pink: 0xff2bbd,
  gold: 0xffd166,
  lime: 0x69ff91,
  red: 0xff4f68,
  violet: 0x7b3cff,
  glass: 0x0af0ff,
  black: 0x050507,
};

const materials = {
  road: new THREE.MeshStandardMaterial({
    color: palette.asphalt,
    roughness: 0.82,
    metalness: 0.1,
  }),
  shoulder: new THREE.MeshBasicMaterial({ color: palette.shoulder }),
  lane: new THREE.MeshBasicMaterial({ color: palette.gold }),
  cyan: new THREE.MeshBasicMaterial({ color: palette.cyan }),
  pink: new THREE.MeshBasicMaterial({ color: palette.pink }),
  lime: new THREE.MeshBasicMaterial({ color: palette.lime }),
  red: new THREE.MeshBasicMaterial({ color: palette.red }),
  gold: new THREE.MeshBasicMaterial({ color: palette.gold }),
  black: new THREE.MeshStandardMaterial({ color: palette.black, roughness: 0.9, metalness: 0.25 }),
  glass: new THREE.MeshStandardMaterial({
    color: palette.glass,
    roughness: 0.2,
    metalness: 0.2,
    transparent: true,
    opacity: 0.72,
  }),
};

for (const material of Object.values(materials)) {
  material.userData.shared = true;
}

const world = new THREE.Group();
const roadGroup = new THREE.Group();
const sceneryGroup = new THREE.Group();
const dynamicGroup = new THREE.Group();
const pickupGroup = new THREE.Group();
const trafficGroup = new THREE.Group();

scene.add(world);
world.add(roadGroup, sceneryGroup, dynamicGroup, pickupGroup, trafficGroup);

const hemiLight = new THREE.HemisphereLight(0xff7ade, 0x05040a, 1.2);
const keyLight = new THREE.DirectionalLight(0xffd166, 1.4);
keyLight.position.set(-7, 14, 7);
const rimLight = new THREE.DirectionalLight(0x19f7ff, 1.2);
rimLight.position.set(8, 8, 12);
scene.add(hemiLight, keyLight, rimLight);

const player = createCar(0xff2bbd, 0x19f7ff, true);
player.position.set(0, 0.16, 5.8);
scene.add(player);

const headLightLeft = new THREE.PointLight(0x19f7ff, 1.4, 18);
const headLightRight = new THREE.PointLight(0xff2bbd, 1.2, 18);
headLightLeft.position.set(-0.8, 0.8, -2.2);
headLightRight.position.set(0.8, 0.8, -2.2);
player.add(headLightLeft, headLightRight);

const roadSegments = [];
const roadSegmentLength = 82;
const roadSegmentCount = 5;
const roadWidth = 12;
const laneXs = [-3.35, 0, 3.35];
const roadLimit = 4.75;
const playerZ = 5.8;

const movePools = {
  lanes: [],
  rails: [],
  gridRows: [],
  gates: [],
  palms: [],
};

const traffic = [];
const pickups = [];
const sparks = [];

const input = {
  left: false,
  right: false,
  accelerate: false,
  brake: false,
  boost: false,
};

const state = {
  running: false,
  paused: false,
  ended: false,
  muted: false,
  speed: 0,
  score: 0,
  scoreFloat: 0,
  distance: 0,
  health: 100,
  boost: 64,
  playerX: 0,
  targetCameraX: 0,
  roadPulse: 0,
  trafficTimer: 0,
  pickupTimer: 0,
  shake: 0,
  combo: 1,
  comboTimer: 0,
};

let lastTime = performance.now();
let toastTimer = 0;

const audio = {
  context: null,
  master: null,
  engine: null,
  engineGain: null,
};

buildWorld();
updateCamera(0);
renderer.setAnimationLoop(tick);

startButton.addEventListener("click", startRun);
restartButton.addEventListener("click", startRun);
resumeButton.addEventListener("click", () => setPaused(false));
pauseButton.addEventListener("click", () => setPaused(!state.paused));
muteButton.addEventListener("click", toggleMute);
window.addEventListener("resize", resize);
window.addEventListener("blur", () => {
  if (state.running && !state.ended) setPaused(true);
});

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  showToast("Signal Lost");
  setPaused(true);
});

document.addEventListener("keydown", (event) => {
  if (event.repeat && event.code !== "Space") return;

  if (event.code === "Enter" && (!state.running || state.ended)) {
    startRun();
    return;
  }

  if (event.code === "KeyP" || event.code === "Escape") {
    if (state.running && !state.ended) setPaused(!state.paused);
    return;
  }

  const control = keyToControl(event.code);
  if (!control) return;
  input[control] = true;
  event.preventDefault();
});

document.addEventListener("keyup", (event) => {
  const control = keyToControl(event.code);
  if (!control) return;
  input[control] = false;
  event.preventDefault();
});

for (const button of touchButtons) {
  const control = button.dataset.control;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    input[control] = true;
    button.classList.add("is-active");
  });

  for (const type of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]) {
    button.addEventListener(type, () => {
      input[control] = false;
      button.classList.remove("is-active");
    });
  }
}

function buildWorld() {
  addSky();
  addRoad();
  addGrid();
  addNeonGates();
  addPalms();
  addStars();
}

function addSky() {
  const sunTexture = makeSunTexture();
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(22, 64),
    new THREE.MeshBasicMaterial({ map: sunTexture, transparent: true, side: THREE.DoubleSide })
  );
  sun.position.set(0, 28, -196);
  sceneryGroup.add(sun);

  const backMountains = createMountainLayer(0x180b34, -199, 6.5, 1.25);
  const frontMountains = createMountainLayer(0x251147, -178, 4.8, 0.88);
  sceneryGroup.add(backMountains, frontMountains);
}

function addRoad() {
  for (let index = 0; index < roadSegmentCount; index += 1) {
    const segment = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, roadSegmentLength), materials.road);
    segment.rotation.x = -Math.PI / 2;
    segment.position.z = 36 - index * roadSegmentLength;
    segment.receiveShadow = true;
    roadGroup.add(segment);
    roadSegments.push(segment);

    const leftShoulder = new THREE.Mesh(new THREE.PlaneGeometry(1.2, roadSegmentLength), materials.shoulder);
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.set(-6.6, 0.006, segment.position.z);
    roadGroup.add(leftShoulder);

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = 6.6;
    roadGroup.add(rightShoulder);

    roadSegments.push(leftShoulder, rightShoulder);
  }

  const dashGeometry = new THREE.BoxGeometry(0.13, 0.045, 4.8);
  for (let z = -204; z < 38; z += 12) {
    for (const x of [-2.05, 2.05]) {
      const dash = new THREE.Mesh(dashGeometry, materials.lane);
      dash.position.set(x, 0.06, z);
      roadGroup.add(dash);
      movePools.lanes.push(dash);
    }
  }

  const railGeometry = new THREE.BoxGeometry(0.18, 0.12, 5.4);
  for (let z = -208; z < 38; z += 9) {
    const left = new THREE.Mesh(railGeometry, materials.cyan);
    left.position.set(-6.18, 0.2, z);
    const right = new THREE.Mesh(railGeometry, materials.pink);
    right.position.set(6.18, 0.2, z);
    roadGroup.add(left, right);
    movePools.rails.push(left, right);
  }
}

function addGrid() {
  const rowMaterial = new THREE.LineBasicMaterial({ color: palette.violet, transparent: true, opacity: 0.72 });
  const columnMaterial = new THREE.LineBasicMaterial({ color: palette.cyan, transparent: true, opacity: 0.4 });

  for (let z = -220; z <= 40; z += 10) {
    for (const side of [-1, 1]) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(side * 7.5, 0.045, z),
        new THREE.Vector3(side * 60, 0.045, z),
      ]);
      const row = new THREE.Line(geometry, rowMaterial);
      sceneryGroup.add(row);
      movePools.gridRows.push(row);
    }
  }

  for (let x = -56; x <= 56; x += 5.6) {
    if (Math.abs(x) < 7.2) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.04, -230),
      new THREE.Vector3(x, 0.04, 42),
    ]);
    sceneryGroup.add(new THREE.Line(geometry, columnMaterial));
  }
}

function addNeonGates() {
  const postGeometry = new THREE.BoxGeometry(0.24, 5.6, 0.24);
  const beamGeometry = new THREE.BoxGeometry(13.2, 0.24, 0.24);
  for (let index = 0; index < 7; index += 1) {
    const gate = new THREE.Group();
    const color = index % 2 === 0 ? materials.cyan : materials.pink;
    const left = new THREE.Mesh(postGeometry, color);
    const right = new THREE.Mesh(postGeometry, color);
    const beam = new THREE.Mesh(beamGeometry, color);
    left.position.set(-6.5, 2.8, 0);
    right.position.set(6.5, 2.8, 0);
    beam.position.set(0, 5.5, 0);
    gate.add(left, right, beam);
    gate.position.z = -44 - index * 44;
    sceneryGroup.add(gate);
    movePools.gates.push(gate);
  }
}

function addPalms() {
  for (let index = 0; index < 18; index += 1) {
    const palm = createPalm(index % 2 === 0 ? palette.cyan : palette.pink);
    const side = index % 2 === 0 ? -1 : 1;
    palm.position.set(side * (10 + Math.random() * 14), 0, -18 - index * 16);
    palm.rotation.y = side * 0.24;
    sceneryGroup.add(palm);
    movePools.palms.push(palm);
  }
}

function addStars() {
  const positions = [];
  for (let index = 0; index < 260; index += 1) {
    positions.push(
      THREE.MathUtils.randFloatSpread(180),
      THREE.MathUtils.randFloat(32, 88),
      THREE.MathUtils.randFloat(-230, -80)
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xf8f7ff,
    size: 0.22,
    transparent: true,
    opacity: 0.82,
    sizeAttenuation: true,
  });
  sceneryGroup.add(new THREE.Points(geometry, material));
}

function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (state.running && !state.paused && !state.ended) {
    updateGame(dt);
  }

  updateCamera(dt);
  updateEffects(dt);
  renderer.render(scene, camera);
}

function updateGame(dt) {
  const steering = Number(input.right) - Number(input.left);
  const boosting = input.boost && state.boost > 0 && !input.brake;
  const targetSpeed = input.brake ? 18 : input.accelerate ? 50 : 36;
  const topSpeed = boosting ? 68 : 54;
  const acceleration = boosting ? 3.8 : 1.8;

  state.speed += (targetSpeed - state.speed) * acceleration * dt;
  state.speed = THREE.MathUtils.clamp(state.speed, 8, topSpeed);

  if (boosting) {
    state.speed = Math.min(topSpeed, state.speed + 36 * dt);
    state.boost = Math.max(0, state.boost - 34 * dt);
    state.roadPulse = Math.min(1, state.roadPulse + dt * 3);
  } else {
    state.boost = Math.min(100, state.boost + 9 * dt);
    state.roadPulse = Math.max(0, state.roadPulse - dt * 2);
  }

  const handling = input.brake ? 7.4 : 9.6;
  state.playerX += steering * handling * dt * (0.72 + state.speed / 68);
  state.playerX = THREE.MathUtils.clamp(state.playerX, -roadLimit, roadLimit);
  state.targetCameraX = state.playerX * 0.35;

  player.position.x += (state.playerX - player.position.x) * Math.min(1, dt * 12);
  player.rotation.z += (-steering * 0.16 - player.rotation.z) * Math.min(1, dt * 9);
  player.rotation.y += (-steering * 0.12 - player.rotation.y) * Math.min(1, dt * 7);

  const scroll = state.speed * dt;
  state.distance += scroll;
  state.scoreFloat += scroll * (boosting ? 8.5 : 5.6) * state.combo;
  state.score = Math.floor(state.scoreFloat);

  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
  } else {
    state.combo = 1;
  }

  moveWorld(scroll, dt);
  spawnTraffic(dt);
  spawnPickups(dt);
  updateTraffic(dt, boosting);
  updatePickups(dt);
  updateHud();
  updateAudio();
}

function moveWorld(scroll, dt) {
  for (const segment of roadSegments) {
    segment.position.z += scroll;
    if (segment.position.z > 86) segment.position.z -= roadSegmentLength * roadSegmentCount;
  }

  moveLoop(movePools.lanes, scroll, 252, 42);
  moveLoop(movePools.rails, scroll, 252, 42);
  moveLoop(movePools.gridRows, scroll, 270, 45);
  moveLoop(movePools.gates, scroll, 308, 54);
  moveLoop(movePools.palms, scroll * 0.96, 304, 46);

  for (const gate of movePools.gates) {
    const scale = 1 + Math.sin((state.distance + gate.position.z) * 0.08) * 0.018;
    gate.scale.setScalar(scale);
  }

  player.children.forEach((child, index) => {
    if (!child.userData.wheel) return;
    child.rotation.x -= dt * state.speed * 2.3 * (index % 2 === 0 ? 1 : -1);
  });
}

function moveLoop(items, scroll, span, resetZ) {
  for (const item of items) {
    item.position.z += scroll;
    if (item.position.z > resetZ) item.position.z -= span;
  }
}

function spawnTraffic(dt) {
  state.trafficTimer -= dt;
  if (state.trafficTimer > 0) return;

  const waveSpeed = THREE.MathUtils.clamp(state.distance / 780, 0, 1.15);
  state.trafficTimer = THREE.MathUtils.randFloat(0.46, 1.05 - waveSpeed * 0.28);

  const lane = laneXs[Math.floor(Math.random() * laneXs.length)];
  const color = randomFrom([0x19f7ff, 0xff2bbd, 0xffd166, 0x69ff91, 0x7b3cff]);
  const accent = color === 0xffd166 ? 0x19f7ff : 0xffd166;
  const car = createCar(color, accent, false);
  car.scale.setScalar(THREE.MathUtils.randFloat(0.88, 1.1));
  car.position.set(lane + THREE.MathUtils.randFloatSpread(0.45), 0.12, -176);
  trafficGroup.add(car);

  traffic.push({
    mesh: car,
    lane,
    speed: THREE.MathUtils.randFloat(10, 24),
    hit: false,
  });
}

function spawnPickups(dt) {
  state.pickupTimer -= dt;
  if (state.pickupTimer > 0) return;

  state.pickupTimer = THREE.MathUtils.randFloat(1.1, 2.2);
  const lane = laneXs[Math.floor(Math.random() * laneXs.length)];
  const type = Math.random() > 0.72 ? "repair" : Math.random() > 0.42 ? "boost" : "score";
  const mesh = createPickup(type);
  mesh.position.set(lane + THREE.MathUtils.randFloatSpread(0.28), 1.0, -176);
  pickupGroup.add(mesh);
  pickups.push({ mesh, type });
}

function updateTraffic(dt, boosting) {
  for (let index = traffic.length - 1; index >= 0; index -= 1) {
    const car = traffic[index];
    const mesh = car.mesh;
    mesh.position.z += Math.max(11, state.speed - car.speed) * dt;
    mesh.rotation.z = Math.sin(performance.now() * 0.004 + mesh.position.x) * 0.025;

    if (mesh.position.z > 24) {
      trafficGroup.remove(mesh);
      disposeObject(mesh);
      traffic.splice(index, 1);
      state.scoreFloat += 180 * state.combo;
      continue;
    }

    if (car.hit) continue;
    const closeZ = Math.abs(mesh.position.z - playerZ) < 2.9;
    const closeX = Math.abs(mesh.position.x - state.playerX) < 1.55;
    if (!closeZ || !closeX) continue;

    car.hit = true;
    trafficGroup.remove(mesh);
    disposeObject(mesh);
    traffic.splice(index, 1);
    spawnSparks(state.playerX, 1.1, playerZ - 0.7, boosting ? palette.gold : palette.red);

    if (boosting) {
      state.scoreFloat += 680 * state.combo;
      state.combo = Math.min(5, state.combo + 1);
      state.comboTimer = 3;
      state.boost = Math.max(0, state.boost - 12);
      state.shake = Math.max(state.shake, 0.28);
      showToast("Overdrive");
      playBlip("boost");
    } else {
      state.health = Math.max(0, state.health - 24);
      state.combo = 1;
      state.speed *= 0.54;
      state.shake = Math.max(state.shake, 0.72);
      showToast("Crash");
      playBlip("crash");
      if (state.health <= 0) endRun();
    }
  }
}

function updatePickups(dt) {
  for (let index = pickups.length - 1; index >= 0; index -= 1) {
    const pickup = pickups[index];
    const mesh = pickup.mesh;
    mesh.position.z += state.speed * dt;
    mesh.rotation.y += dt * 3.6;
    mesh.rotation.x = Math.sin(performance.now() * 0.004 + mesh.position.z) * 0.24;
    mesh.position.y = 1.05 + Math.sin(performance.now() * 0.006 + index) * 0.14;

    if (mesh.position.z > 24) {
      pickupGroup.remove(mesh);
      disposeObject(mesh);
      pickups.splice(index, 1);
      continue;
    }

    const closeZ = Math.abs(mesh.position.z - playerZ) < 2.3;
    const closeX = Math.abs(mesh.position.x - state.playerX) < 1.35;
    if (!closeZ || !closeX) continue;

    applyPickup(pickup.type);
    pickupGroup.remove(mesh);
    disposeObject(mesh);
    pickups.splice(index, 1);
  }
}

function applyPickup(type) {
  if (type === "repair") {
    state.health = Math.min(100, state.health + 16);
    state.scoreFloat += 120 * state.combo;
    showToast("Coolant");
    playBlip("repair");
    return;
  }

  if (type === "boost") {
    state.boost = Math.min(100, state.boost + 28);
    state.scoreFloat += 160 * state.combo;
    showToast("Turbo");
    playBlip("boost");
    return;
  }

  state.scoreFloat += 420 * state.combo;
  state.combo = Math.min(5, state.combo + 1);
  state.comboTimer = 3.4;
  showToast(`x${state.combo}`);
  playBlip("score");
}

function updateEffects(dt) {
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toast.hidden = true;
  }

  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 1.8);
  }

  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    const spark = sparks[index];
    spark.life -= dt;
    spark.mesh.position.addScaledVector(spark.velocity, dt);
    spark.mesh.scale.multiplyScalar(0.95);
    if (spark.life <= 0) {
      scene.remove(spark.mesh);
      disposeObject(spark.mesh);
      sparks.splice(index, 1);
    }
  }
}

function updateCamera(dt) {
  const shakeX = state.shake > 0 ? THREE.MathUtils.randFloatSpread(state.shake * 0.32) : 0;
  const shakeY = state.shake > 0 ? THREE.MathUtils.randFloatSpread(state.shake * 0.2) : 0;
  const targetX = state.targetCameraX + shakeX;
  const targetY = 7.1 + state.roadPulse * 0.28 + shakeY;
  const targetZ = 15.8 - state.roadPulse * 1.2;

  camera.position.x += (targetX - camera.position.x) * Math.min(1, dt * 5.5);
  camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 4.5);
  camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 5);
  camera.lookAt(state.playerX * 0.22, 1.05, -18);
}

function updateHud() {
  scoreText.textContent = String(state.score).padStart(6, "0").slice(-6);
  speedText.textContent = String(Math.round(state.speed * 2.05)).padStart(3, "0");
  healthBar.style.width = `${state.health}%`;
  boostBar.style.width = `${state.boost}%`;
}

function startRun() {
  resetRun();
  initAudio();
  startScreen.hidden = true;
  startScreen.classList.remove("screen--active");
  gameOverPanel.hidden = true;
  pausePanel.hidden = true;
  hud.hidden = false;
  touchControls.hidden = false;
  state.running = true;
  state.paused = false;
  state.ended = false;
  lastTime = performance.now();
  showToast("Go");
}

function resetRun() {
  for (const car of traffic.splice(0)) {
    trafficGroup.remove(car.mesh);
    disposeObject(car.mesh);
  }
  for (const pickup of pickups.splice(0)) {
    pickupGroup.remove(pickup.mesh);
    disposeObject(pickup.mesh);
  }
  for (const spark of sparks.splice(0)) {
    scene.remove(spark.mesh);
    disposeObject(spark.mesh);
  }

  state.speed = 28;
  state.score = 0;
  state.scoreFloat = 0;
  state.distance = 0;
  state.health = 100;
  state.boost = 64;
  state.playerX = 0;
  state.targetCameraX = 0;
  state.roadPulse = 0;
  state.trafficTimer = 0.3;
  state.pickupTimer = 1.1;
  state.shake = 0;
  state.combo = 1;
  state.comboTimer = 0;
  player.position.x = 0;
  player.rotation.set(0, 0, 0);
  updateHud();
}

function endRun() {
  state.ended = true;
  state.running = false;
  hud.hidden = true;
  touchControls.hidden = true;
  finalScore.textContent = String(state.score).padStart(6, "0");
  gameOverPanel.hidden = false;
  showToast("Run Ended");
}

function setPaused(paused) {
  if (!state.running || state.ended) return;
  state.paused = paused;
  pausePanel.hidden = !paused;
  pauseButton.classList.toggle("is-active", paused);
  if (!paused) {
    lastTime = performance.now();
    if (audio.context?.state === "suspended") audio.context.resume();
  }
}

function toggleMute() {
  state.muted = !state.muted;
  muteButton.classList.toggle("is-active", state.muted);
  muteButton.setAttribute("aria-label", state.muted ? "Unmute" : "Mute");
  if (audio.master) {
    audio.master.gain.setTargetAtTime(state.muted ? 0 : 0.1, audio.context.currentTime, 0.03);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = 0.88;
}

function keyToControl(code) {
  switch (code) {
    case "ArrowLeft":
    case "KeyA":
      return "left";
    case "ArrowRight":
    case "KeyD":
      return "right";
    case "ArrowUp":
    case "KeyW":
      return "accelerate";
    case "ArrowDown":
    case "KeyS":
      return "brake";
    case "Space":
    case "ShiftLeft":
    case "ShiftRight":
      return "boost";
    default:
      return "";
  }
}

function createCar(bodyColor, accentColor, isPlayer) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.42,
    metalness: 0.45,
    flatShading: true,
  });
  const accentMaterial = new THREE.MeshBasicMaterial({ color: accentColor });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.54, 3.45), bodyMaterial);
  body.position.y = 0.54;
  body.castShadow = true;

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.24, 1.28), bodyMaterial);
  hood.position.set(0, 0.91, -0.72);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.68, 1.18), materials.glass);
  cabin.position.set(0, 1.12, 0.35);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.16, 0.3), accentMaterial);
  spoiler.position.set(0, 1.03, 1.78);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.2, 0.28), accentMaterial);
  nose.position.set(0, 0.72, -1.84);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.18), materials.red);
  tail.position.set(0, 0.76, 1.86);

  group.add(body, hood, cabin, spoiler, nose, tail);

  const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.34, 14);
  for (const x of [-1.05, 1.05]) {
    for (const z of [-1.12, 1.22]) {
      const wheel = new THREE.Mesh(wheelGeometry, materials.black);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.36, z);
      wheel.userData.wheel = true;
      group.add(wheel);
    }
  }

  if (isPlayer) {
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(2.35, 0.05, 4.05),
      new THREE.MeshBasicMaterial({ color: palette.cyan, transparent: true, opacity: 0.22 })
    );
    glow.position.y = 0.08;
    group.add(glow);
  }

  return group;
}

function createPickup(type) {
  const group = new THREE.Group();
  if (type === "boost") {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), materials.cyan);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 18), materials.pink);
    ring.rotation.x = Math.PI / 2;
    group.add(core, ring);
    return group;
  }

  if (type === "repair") {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), materials.lime);
    const slash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.2), materials.black);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.2), materials.black);
    group.add(cube, slash, bar);
    return group;
  }

  const cassette = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.66, 0.16), materials.gold);
  const leftReel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 16), materials.black);
  const rightReel = leftReel.clone();
  leftReel.rotation.x = Math.PI / 2;
  rightReel.rotation.x = Math.PI / 2;
  leftReel.position.set(-0.28, 0, 0.12);
  rightReel.position.set(0.28, 0, 0.12);
  group.add(cassette, leftReel, rightReel);
  return group;
}

function createPalm(color) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, 4.6, 6),
    new THREE.MeshBasicMaterial({ color: 0x432356 })
  );
  trunk.position.y = 2.2;
  trunk.rotation.z = THREE.MathUtils.randFloatSpread(0.18);
  group.add(trunk);

  const leafMaterial = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  for (let index = 0; index < 5; index += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.2, 4), leafMaterial);
    leaf.position.y = 4.5;
    leaf.rotation.z = Math.PI / 2;
    leaf.rotation.y = (Math.PI * 2 * index) / 5;
    leaf.position.x = Math.cos(leaf.rotation.y) * 0.56;
    leaf.position.z = Math.sin(leaf.rotation.y) * 0.56;
    group.add(leaf);
  }

  return group;
}

function createMountainLayer(color, z, baseY, heightScale) {
  const shape = new THREE.Shape();
  shape.moveTo(-82, baseY);
  for (let index = 0; index <= 13; index += 1) {
    const x = -82 + index * 13.7;
    const y = baseY + THREE.MathUtils.randFloat(4, 14) * heightScale;
    shape.lineTo(x, y);
  }
  shape.lineTo(82, baseY);
  shape.lineTo(-82, baseY);

  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
  );
  mesh.position.z = z;
  return mesh;
}

function makeSunTexture() {
  const size = 256;
  const canvasEl = document.createElement("canvas");
  canvasEl.width = size;
  canvasEl.height = size;
  const context = canvasEl.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "#fff7ad");
  gradient.addColorStop(0.42, "#ffd166");
  gradient.addColorStop(0.68, "#ff5a9d");
  gradient.addColorStop(1, "rgba(255, 43, 189, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  context.globalCompositeOperation = "destination-out";
  for (let y = 142; y < 230; y += 18) {
    context.fillRect(0, y, size, 7);
  }

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function spawnSparks(x, y, z, color) {
  const material = new THREE.MeshBasicMaterial({ color });
  for (let index = 0; index < 18; index += 1) {
    const spark = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.42), material.clone());
    spark.position.set(x, y, z);
    spark.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    scene.add(spark);
    sparks.push({
      mesh: spark,
      life: THREE.MathUtils.randFloat(0.26, 0.62),
      velocity: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(8),
        THREE.MathUtils.randFloat(1, 7),
        THREE.MathUtils.randFloatSpread(7)
      ),
    });
  }
}

function initAudio() {
  if (audio.context) {
    if (audio.context.state === "suspended") audio.context.resume();
    return;
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  audio.context = new AudioContext();
  audio.master = audio.context.createGain();
  audio.master.gain.value = state.muted ? 0 : 0.1;
  audio.master.connect(audio.context.destination);

  const filter = audio.context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;

  audio.engine = audio.context.createOscillator();
  audio.engine.type = "sawtooth";
  audio.engine.frequency.value = 90;
  audio.engineGain = audio.context.createGain();
  audio.engineGain.gain.value = 0.025;

  audio.engine.connect(filter);
  filter.connect(audio.engineGain);
  audio.engineGain.connect(audio.master);
  audio.engine.start();
}

function updateAudio() {
  if (!audio.context || !audio.engine) return;
  const now = audio.context.currentTime;
  audio.engine.frequency.setTargetAtTime(58 + state.speed * 3.2 + state.roadPulse * 55, now, 0.035);
  audio.engineGain.gain.setTargetAtTime(state.paused || state.ended ? 0.005 : 0.02 + state.roadPulse * 0.025, now, 0.05);
}

function playBlip(type) {
  if (!audio.context || state.muted) return;
  const now = audio.context.currentTime;
  const osc = audio.context.createOscillator();
  const gain = audio.context.createGain();
  const frequency = {
    score: 560,
    boost: 260,
    repair: 420,
    crash: 90,
  }[type] || 320;

  osc.type = type === "crash" ? "sawtooth" : "square";
  osc.frequency.setValueAtTime(frequency, now);
  osc.frequency.exponentialRampToValueAtTime(type === "crash" ? 42 : frequency * 1.8, now + 0.12);
  gain.gain.setValueAtTime(type === "crash" ? 0.14 : 0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === "crash" ? 0.24 : 0.14));
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(now);
  osc.stop(now + 0.26);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        if (!material.userData?.shared) material.dispose?.();
      });
    } else if (!child.material?.userData?.shared) {
      child.material?.dispose?.();
    }
  });
}

function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
}
