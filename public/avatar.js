import * as THREE from "three";

const stage = document.getElementById("avatarStage");
const fallback = document.getElementById("avatarFallback");
const status = document.getElementById("avatarStatus");
const motionButton = document.getElementById("avatarMotion");

let renderer, scene, camera, character, mouth, leftLid, rightLid;
let talking = false;
let motion = true;
let lastBlink = performance.now() + 1800;
let blinkPhase = 0;
let lastFrame = 0;

const material = (color, roughness = 0.72, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function addMesh(parent, geometry, mat, position, scale, rotation) {
  const mesh = new THREE.Mesh(geometry, mat);
  if (position) mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function buildCharacter() {
  const skin = material("#ffd9ce");
  const skinShadow = material("#e9a99f");
  const hair = material("#202b4c", 0.42);
  const hairLight = material("#526f9e", 0.42);
  const eyeWhite = material("#fff7f4", 0.35);
  const iris = material("#57c9e8", 0.28, 0.08);
  const pupil = material("#14253d", 0.25);
  const shine = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const outfit = material("#9dcfff", 0.55);
  const bowMat = material("#e8a8ff", 0.48);
  const mouthMat = material("#8b344e", 0.6);

  const root = new THREE.Group();
  character = new THREE.Group();
  root.add(character);

  // Torso and collar
  addMesh(character, new THREE.CylinderGeometry(0.42, 0.55, 0.95, 24), outfit, [0, 0.15, 0], [1, 1, 0.7]);
  addMesh(character, new THREE.CylinderGeometry(0.22, 0.22, 0.18, 20), skin, [0, 0.72, 0], [1, 1, 0.8]);
  addMesh(character, new THREE.SphereGeometry(0.13, 16, 12), bowMat, [-0.15, 0.63, 0.24], [1.2, 0.65, 0.6]);
  addMesh(character, new THREE.SphereGeometry(0.13, 16, 12), bowMat, [0.15, 0.63, 0.24], [1.2, 0.65, 0.6]);

  // Face
  addMesh(character, new THREE.SphereGeometry(0.72, 32, 24), skin, [0, 1.68, 0], [0.82, 1, 0.72]);
  addMesh(character, new THREE.SphereGeometry(0.12, 16, 12), skinShadow, [-0.60, 1.48, 0.32], [0.9, 0.72, 0.4]);
  addMesh(character, new THREE.SphereGeometry(0.12, 16, 12), skinShadow, [0.60, 1.48, 0.32], [0.9, 0.72, 0.4]);

  // Eyes, irises, pupils, highlights. The small eyelid pieces animate during blinking.
  for (const x of [-0.27, 0.27]) {
    addMesh(character, new THREE.SphereGeometry(0.17, 20, 16), eyeWhite, [x, 1.77, 0.56], [0.78, 1.12, 0.38]);
    addMesh(character, new THREE.SphereGeometry(0.105, 20, 16), iris, [x, 1.76, 0.645], [0.78, 1.05, 0.35]);
    addMesh(character, new THREE.SphereGeometry(0.052, 16, 12), pupil, [x, 1.755, 0.677], [0.8, 1.1, 0.35]);
    addMesh(character, new THREE.SphereGeometry(0.028, 12, 8), shine, [x - 0.025, 1.805, 0.697], [0.8, 1, 0.35]);
  }
  leftLid = addMesh(character, new THREE.SphereGeometry(0.17, 20, 12), hair, [-0.27, 1.77, 0.59], [0.8, 0.02, 0.4]);
  rightLid = addMesh(character, new THREE.SphereGeometry(0.17, 20, 12), hair, [0.27, 1.77, 0.59], [0.8, 0.02, 0.4]);

  // Nose and mouth; the mouth scales up while the TTS voice is playing.
  addMesh(character, new THREE.SphereGeometry(0.035, 12, 8), skinShadow, [0, 1.58, 0.69], [0.7, 0.8, 0.5]);
  mouth = addMesh(character, new THREE.SphereGeometry(0.075, 16, 12), mouthMat, [0, 1.43, 0.63], [0.85, 0.14, 0.24]);

  // Hair cap and stylized bangs
  addMesh(character, new THREE.SphereGeometry(0.75, 28, 20), hair, [0, 2.05, -0.02], [0.94, 0.75, 0.82]);
  addMesh(character, new THREE.ConeGeometry(0.24, 0.63, 7), hair, [-0.42, 1.95, 0.47], [1, 1, 0.65], [0, 0, 0.18]);
  addMesh(character, new THREE.ConeGeometry(0.25, 0.66, 7), hair, [-0.13, 1.99, 0.53], [1, 1, 0.65], [0, 0, -0.08]);
  addMesh(character, new THREE.ConeGeometry(0.25, 0.62, 7), hair, [0.18, 1.97, 0.50], [1, 1, 0.65], [0, 0, -0.16]);
  addMesh(character, new THREE.ConeGeometry(0.22, 0.60, 7), hair, [0.45, 1.91, 0.42], [1, 1, 0.65], [0, 0, -0.3]);
  // Side locks
  addMesh(character, new THREE.ConeGeometry(0.22, 1.12, 8), hair, [-0.64, 1.38, 0.02], [0.85, 1, 0.7], [0, 0, 0.12]);
  addMesh(character, new THREE.ConeGeometry(0.22, 1.12, 8), hair, [0.64, 1.38, 0.02], [0.85, 1, 0.7], [0, 0, -0.12]);
  addMesh(character, new THREE.SphereGeometry(0.12, 16, 12), hairLight, [-0.48, 2.31, 0.34], [0.25, 0.08, 0.12]);
  addMesh(character, new THREE.SphereGeometry(0.12, 16, 12), hairLight, [0.32, 2.34, 0.33], [0.25, 0.08, 0.12]);

  // Small shoulders
  addMesh(character, new THREE.SphereGeometry(0.26, 20, 16), outfit, [-0.43, 0.48, 0], [1.2, 0.9, 0.8]);
  addMesh(character, new THREE.SphereGeometry(0.26, 20, 16), outfit, [0.43, 0.48, 0], [1.2, 0.9, 0.8]);

  character.position.y = -0.42;
  return root;
}

function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-label", "Avatar anime 3D de Dekiller");
    stage.prepend(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, stage.clientWidth / stage.clientHeight, 0.1, 50);
    camera.position.set(0, 1.18, 6.6);
    camera.lookAt(0, 1.05, 0);

    scene.add(new THREE.HemisphereLight(0xcbe6ff, 0x20243b, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 5, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0x75d8ff, 13, 12);
    rim.position.set(2, 2.5, -2);
    scene.add(rim);

    const avatar = buildCharacter();
    scene.add(avatar);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 40),
      new THREE.MeshBasicMaterial({ color: 0x263e65, transparent: true, opacity: 0.35 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.45;
    scene.add(floor);

    fallback.hidden = true;
    status.textContent = "Avatar 3D listo · habla para animar su boca.";
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("dekiller:talking", (event) => {
      talking = Boolean(event.detail?.talking);
    });
    motionButton.addEventListener("click", () => {
      motion = !motion;
      motionButton.textContent = motion ? "Pausar movimiento" : "Reanudar movimiento";
    });
    animate();
  } catch (error) {
    status.textContent = "No se pudo iniciar el avatar 3D.";
    fallback.hidden = false;
    fallback.innerHTML = "✦<span>WebGL no disponible</span>";
    console.error("Avatar 3D:", error);
  }
}

function resize() {
  if (!renderer || !camera) return;
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;
  // Cap to ~30 FPS to reduce heat/battery use on a phone.
  if (now - lastFrame < 32) return;
  lastFrame = now;

  if (character && motion) {
    const t = now * 0.001;
    character.rotation.y = Math.sin(t * 0.6) * 0.12;
    character.position.y = -0.42 + Math.sin(t * 1.8) * 0.025;
    character.rotation.z = Math.sin(t * 0.8) * 0.012;
  }
  if (mouth) {
    const pulse = talking ? (0.3 + Math.abs(Math.sin(now * 0.025)) * 0.85) : 0.14;
    mouth.scale.y = pulse;
  }

  // Brief periodic blink.
  if (now > lastBlink && blinkPhase === 0) {
    blinkPhase = 1;
    lastBlink = now + 150;
  }
  if (blinkPhase) {
    const amount = blinkPhase === 1 ? 0.9 : 0.02;
    if (leftLid && rightLid) {
      leftLid.scale.y = amount;
      rightLid.scale.y = amount;
    }
    if (blinkPhase === 1 && now > lastBlink) {
      blinkPhase = 2;
      lastBlink = now + 100;
    } else if (blinkPhase === 2 && now > lastBlink) {
      blinkPhase = 0;
      lastBlink = now + 2400 + Math.random() * 2600;
      if (leftLid && rightLid) {
        leftLid.scale.y = 0.02;
        rightLid.scale.y = 0.02;
      }
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener("error", (event) => {
  if (String(event.message || "").includes("import")) {
    status.textContent = "No se pudo descargar Three.js. Comprueba la conexión a Internet.";
    fallback.hidden = false;
  }
});

init();
