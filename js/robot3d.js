import * as THREE from './three.module.min.js';

// 3D hero robot: an armoured white humanoid with a dark visor helmet, built from primitives.
// If WebGL or this module fails, the inline SVG robot stays visible.
const host = document.getElementById('robot3d');

if (host) {
  try {
    init(host);
  } catch (err) {
    console.warn('3D robot unavailable, using SVG fallback.', err);
  }
}

function init(host) {
  const stage = host.querySelector('[data-robot-stage]');
  const fallback = stage.querySelector('svg');
  const controls = host.querySelector('[data-robot-controls]');
  const accent = new THREE.Color(host.dataset.accent || '#5EEAD4');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D armoured humanoid robot. Drag to rotate.');
  Object.assign(renderer.domElement.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    cursor: 'grab', touchAction: 'pan-y'
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 0.8, 0.1, 100);

  // ---- studio reflections (soft boxes baked into an environment map) ----
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.08, 0.14), side: THREE.BackSide })));
    const box = (w, h, pos, rgb) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
    };
    box(10, 6, [0, 12, 4], [9, 9, 9]);
    box(5, 10, [10, 3, 6], [5, 5.5, 6]);
    box(5, 10, [-10, 3, 4], [2.4, 2.6, 3]);
    box(8, 3, [0, 1, -12], [accent.r * 6, accent.g * 6, accent.b * 6]);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture;
    pm.dispose();
  }

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b1020, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(accent, 2.6);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  // ---- materials ----
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xeef1f6, roughness: 0.34, metalness: 0.08, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.9 });
  const shellTwo = shell.clone();
  shellTwo.side = THREE.DoubleSide;
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2029, roughness: 0.5, metalness: 0.75, envMapIntensity: 0.8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x03050a, roughness: 0.06, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab2c0, roughness: 0.28, metalness: 1, envMapIntensity: 1.2 });
  const cable = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.7, metalness: 0.2 });
  const dot = new THREE.MeshStandardMaterial({ color: 0x8e95a3, roughness: 0.4, metalness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.2, roughness: 0.3 });

  const rig = new THREE.Group();   // yaw, set by drag / view buttons
  const body = new THREE.Group();  // floats and breathes
  rig.add(body);
  scene.add(rig);

  // ---- helpers ----
  const mesh = (geo, mat, parent, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
    parent.add(m);
    return m;
  };
  const sph = (r = 1, seg = 32) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 10, 24);
  const cyl = (r, h, seg = 28) => new THREE.CylinderGeometry(r, r, h, seg);
  const ring = (r, t = 0.02) => new THREE.TorusGeometry(r, t, 10, 40);
  const tube = (pts, r = 0.025) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 8);
  // point on an ellipsoid surface: polar angle u (0 = top), azimuth w (0 = front)
  const ell = (a, b, c, u, w, k = 1.0) => [
    a * k * Math.sin(u) * Math.sin(w), b * k * Math.cos(u), c * k * Math.sin(u) * Math.cos(w)];
  const rivets = (parent, a, b, c, list, r = 0.016) => {
    for (const [u, w] of list) mesh(sph(r, 8), dot, parent, ell(a, b, c, u, w, 1.0));
  };

  // ---- legs ----
  for (const s of [-1, 1]) {
    const x = s * 0.33;
    mesh(sph(0.22), dark, body, [x, 1.93, 0]);                                            // hip joint
    mesh(cap(0.22, 0.5), shell, body, [x, 1.5, 0]);                                       // thigh
    mesh(sph(1), shell, body, [x, 1.55, 0.16], [0.2, 0.42, 0.14]);                        // thigh plate
    mesh(cyl(0.035, 0.5, 12), steel, body, [x - s * 0.1, 1.5, -0.2]);                     // hydraulic
    mesh(cyl(0.17, 0.42), dark, body, [x, 1.02, 0], [1, 1, 1], [0, 0, Math.PI / 2]);      // knee axle
    mesh(sph(1), shell, body, [x, 1.02, 0.17], [0.18, 0.18, 0.12]);                       // knee cap
    mesh(cap(0.18, 0.46), shell, body, [x, 0.6, 0]);                                      // shin
    mesh(sph(1), shell, body, [x, 0.62, 0.12], [0.17, 0.34, 0.12]);                       // shin plate
    mesh(cyl(0.13, 0.12), dark, body, [x, 0.22, 0]);                                      // ankle
    mesh(sph(1), shell, body, [x, 0.1, 0.13], [0.2, 0.12, 0.34]);                         // foot
    mesh(new THREE.BoxGeometry(0.34, 0.04, 0.6), dark, body, [x, 0.03, 0.12]);            // sole
  }

  // ---- pelvis, waist, abdomen ----
  mesh(sph(1), shell, body, [0, 1.98, 0], [0.62, 0.32, 0.42]);
  for (let i = 0; i < 4; i++) {
    mesh(cyl(0.42 - i * 0.01, 0.13, 36), dark, body, [0, 2.2 + i * 0.15, 0], [1.05, 1, 0.68]);
    mesh(ring(0.42 - i * 0.01, 0.012), steel, body, [0, 2.14 + i * 0.15, 0], [1.05, 0.68, 1], [Math.PI / 2, 0, 0]);
  }
  mesh(sph(1), shell, body, [0, 2.55, 0.16], [0.26, 0.3, 0.18]);                          // abdomen plate
  const waistLight = mesh(sph(0.035, 12), glow, body, [0, 2.2, 0.31]);

  // ---- chest ----
  const chest = new THREE.Group();
  chest.position.set(0, 3.3, 0);
  body.add(chest);
  mesh(sph(1), shell, chest, [0, 0, 0], [0.8, 0.62, 0.5]);
  mesh(new THREE.BoxGeometry(0.42, 0.035, 0.05), glass, chest, [0, -0.04, 0.495], [1, 1, 1], [-0.06, 0, 0]); // vent slit
  mesh(sph(1), shell, chest, [0, -0.32, 0.12], [0.5, 0.2, 0.36]);                         // lower chest plate
  rivets(chest, 0.8, 0.62, 0.5, [[1.0, -0.9], [1.0, 0.9], [1.35, -0.55], [1.35, 0.55], [0.8, -0.4], [0.8, 0.4]]);
  for (const s of [-1, 1]) {
    mesh(cyl(0.07, 0.6, 14), dark, chest, [s * 0.64, -0.18, 0.12]);                       // side hydraulics
    mesh(cyl(0.035, 0.66, 10), steel, chest, [s * 0.64, -0.18, 0.12]);
  }
  mesh(new THREE.BoxGeometry(0.7, 0.7, 0.22), dark, chest, [0, -0.02, -0.5]);             // back unit
  const chestLight = mesh(sph(0.03, 12), glow, chest, [0, 0.2, 0.49]);

  // ---- collar, neck ----
  mesh(sph(1), shell, body, [0, 3.78, 0], [0.5, 0.17, 0.4]);
  for (let i = 0; i < 3; i++) mesh(ring(0.17, 0.028), i === 1 ? steel : dark, body, [0, 3.9 + i * 0.07, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  mesh(cyl(0.13, 0.3, 16), dark, body, [0, 3.95, 0]);

  // ---- head ----
  const head = new THREE.Group();
  head.position.set(0, 4.5, 0);
  body.add(head);
  const A = 0.43, B = 0.5, C = 0.47;
  mesh(sph(1, 40), shell, head, [0, 0, 0], [A, B, C]);                                    // skull
  mesh(new THREE.SphereGeometry(1, 48, 24, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.32, Math.PI * 0.4),
    glass, head, [0, -0.02, 0], [A * 1.02, B * 1.02, C * 1.02]);                          // visor
  mesh(sph(1, 24), shell, head, [0, -0.34, 0.16], [0.3, 0.17, 0.3]);                      // chin guard
  mesh(cap(0.04, 0.5), shell, head, [0, B * 0.97, 0.02], [1, 1, 1], [Math.PI / 2, 0, 0]); // crest
  for (let i = -3; i <= 3; i++) {                                                         // visor status dots
    const p = ell(A, B, C, 1.5, i * 0.17, 1.03);
    mesh(sph(0.012, 8), glow, head, [p[0], p[1] - 0.1, p[2]]);
  }
  for (const s of [-1, 1]) {                                                              // ear discs
    mesh(cyl(0.2, 0.1, 32), shell, head, [s * 0.42, -0.02, 0.02], [1, 1, 1], [0, 0, Math.PI / 2]);
    mesh(ring(0.14, 0.014), steel, head, [s * 0.475, -0.02, 0.02], [1, 1, 1], [0, Math.PI / 2, 0]);
    mesh(cyl(0.07, 0.04, 20), dark, head, [s * 0.48, -0.02, 0.02], [1, 1, 1], [0, 0, Math.PI / 2]);
  }
  rivets(head, A, B, C, [[0.55, 0.5], [0.55, -0.5], [0.8, 1.4], [0.8, -1.4], [0.35, 0.0]], 0.014);

  // ---- arms (crossed over the chest) ----
  const arms = [];
  const makeArm = (s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.9, 3.5, 0);
    body.add(sh);
    mesh(sph(0.2), dark, sh);                                                             // shoulder joint
    mesh(ring(0.2, 0.02), steel, sh, [0, 0, 0], [1, 1, 1], [0, Math.PI / 2, 0]);
    const pauld = mesh(new THREE.SphereGeometry(1, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), shellTwo,
      sh, [s * 0.04, -0.04, 0], [0.37, 0.32, 0.37], [0, 0, s * -0.2]);                       // pauldron
    rivets(pauld, 1, 1, 1, [[0.6, 0.0], [0.6, 1.2], [0.6, -1.2], [0.9, 2.4], [0.9, -2.4]], 0.03);
    mesh(tube([[0, 0, 0], [-s * 0.15, 0.08, -0.12], [-s * 0.3, 0.02, -0.2]], 0.03), cable, sh);
    mesh(cap(0.16, 0.5), shell, sh, [0, -0.52, 0]);                                       // upper arm
    mesh(sph(1), shell, sh, [0, -0.5, 0.06], [0.2, 0.34, 0.2]);
    mesh(ring(0.17, 0.014), dark, sh, [0, -0.82, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    mesh(sph(0.17), dark, sh, [0, -0.98, 0]);                                             // elbow
    mesh(cyl(0.032, 0.34, 10), steel, sh, [s * 0.1, -0.9, -0.06]);
    mesh(tube([[0, -0.74, -0.12], [s * 0.08, -0.95, -0.18], [0, -1.15, -0.1]], 0.026), cable, sh);
    mesh(tube([[0, -0.74, 0.1], [-s * 0.1, -0.98, 0.16], [0, -1.2, 0.1]], 0.022), cable, sh);

    const fore = new THREE.Group();
    fore.position.set(0, -0.98, 0);
    sh.add(fore);
    mesh(cap(0.15, 0.5), shell, fore, [0, -0.5, 0]);                                      // forearm
    const plate = mesh(sph(1), shell, fore, [0, -0.5, 0.05], [0.21, 0.4, 0.2]);
    rivets(plate, 1, 1, 1, [[1.3, 0.3], [1.3, -0.3], [1.9, 0.0]], 0.07);
    mesh(ring(0.16, 0.014), dark, fore, [0, -0.78, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    mesh(cyl(0.1, 0.12, 18), dark, fore, [0, -0.98, 0]);                                  // wrist

    const hand = new THREE.Group();
    hand.position.set(0, -1.12, 0);
    fore.add(hand);
    mesh(new THREE.BoxGeometry(0.2, 0.2, 0.1), dark, hand, [0, -0.05, 0]);
    mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), shell, hand, [0, 0.03, 0]);
    for (let i = -1.5; i <= 1.5; i += 1) {
      const f = new THREE.Group();
      f.position.set(i * 0.047, -0.15, 0);
      f.rotation.x = -0.5;
      hand.add(f);
      mesh(cap(0.022, 0.07), dark, f, [0, -0.04, 0]);
      const f2 = new THREE.Group();
      f2.position.set(0, -0.09, 0); f2.rotation.x = -0.6; f.add(f2);
      mesh(cap(0.02, 0.06), steel, f2, [0, -0.035, 0]);
    }
    mesh(cap(0.025, 0.07), dark, hand, [s * -0.12, -0.04, 0.02], [1, 1, 1], [0, 0, s * 0.8]);
    arms.push({ s, sh, fore });
    return { sh, fore };
  };
  const rightArm = makeArm(1);
  const leftArm = makeArm(-1);

  // crossed pose: upper arms swing forward, forearms fold across the chest
  const pose = (arm, s, lift) => {
    arm.sh.rotation.set(-0.72, -s * 0.12, s * 0.06, 'YXZ');
    arm.fore.rotation.set(-1.75 - lift, -s * 1.2, 0, 'YXZ');
  };
  pose(rightArm, 1, 0.0);
  pose(leftArm, -1, 0.14);

  // soft ground glow
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 48),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // ---- views ----
  const views = { front: [0, 0.1], side: [-Math.PI / 2, 0.1], back: [Math.PI, 0.1], top: [0.45, 0.8] };
  let mode = 'auto';
  let target = 0.25;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pitch = 0.1;
  let targetPitch = 0.1;

  const setMode = (m) => {
    mode = m;
    if (views[m]) { target = views[m][0]; targetPitch = views[m][1]; } else if (m === 'auto') targetPitch = 0.1;
    controls?.querySelectorAll('button[data-view]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.view === m));
    });
  };

  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; targetPitch = pitch;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
    mode = 'drag'; target = rig.rotation.y;
    controls?.querySelectorAll('button[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    target += (e.clientX - lastX) * 0.012;
    targetPitch = Math.min(Math.max(targetPitch + (e.clientY - lastY) * 0.01, -0.2), 1.45);
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const endDrag = () => { dragging = false; el.style.cursor = 'grab'; };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  controls?.querySelectorAll('button[data-view]').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.view)));

  // ---- sizing ----
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);

  stage.appendChild(el);
  resize();
  if (fallback) fallback.style.display = 'none';
  if (controls) controls.hidden = false;
  setMode('auto');

  // ---- animation ----
  let visible = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(host);
  const clock = new THREE.Clock();

  const frame = () => {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const t = reduceMotion ? 0 : clock.getElapsedTime();

    if (mode === 'auto') target = reduceMotion ? 0.25 : 0.25 + Math.sin(t * 0.45) * 0.75;
    rig.rotation.y += (target - rig.rotation.y) * 0.08;
    pitch += (targetPitch - pitch) * 0.08;
    camera.position.set(0, 2.7 + Math.sin(pitch) * 14.5, Math.cos(pitch) * 14.5);
    camera.lookAt(0, 2.55, 0);

    body.position.y = Math.sin(t * 1.4) * 0.05 + 0.05;
    ground.scale.setScalar(1 - Math.sin(t * 1.4) * 0.05);
    chest.scale.set(1, 1 + Math.sin(t * 1.9) * 0.012, 1 + Math.sin(t * 1.9) * 0.02);
    head.rotation.y = Math.sin(t * 0.6) * 0.22;
    head.rotation.x = 0.08 + pitch * 0.25;

    const pulse = 1.8 + Math.sin(t * 2.8) * 0.9;
    glow.emissiveIntensity = reduceMotion ? 2.2 : pulse;
    waistLight.scale.setScalar(1 + (pulse - 1.8) * 0.2);
    chestLight.scale.setScalar(1 + (pulse - 1.8) * 0.2);

    renderer.render(scene, camera);
  };
  frame();
}
