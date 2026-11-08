import * as THREE from './three.module.min.js';

// 3D hero robot. If WebGL or this module fails, the inline SVG robot stays visible.
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
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D humanoid robot. Drag to rotate.');
  Object.assign(renderer.domElement.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    cursor: 'grab', touchAction: 'pan-y'
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 0.8, 0.1, 100);
  camera.position.set(0.5, 2.4, 13.5);
  camera.lookAt(0.5, 2.15, 0);

  // lights
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b1020, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(accent, 3.2);
  rim.position.set(-5, 3, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8aa4ff, 0.8);
  fill.position.set(-4, 1, 4);
  scene.add(fill);

  // materials
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xf3f5f9, roughness: 0.28, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x06080d, roughness: 0.16, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.45, metalness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.2, roughness: 0.3 });

  const rig = new THREE.Group();   // rotated by drag / view buttons
  const body = new THREE.Group();  // floats
  rig.add(body);
  scene.add(rig);

  const mesh = (geo, mat, parent, pos = [0, 0, 0], scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.scale.set(...scale);
    parent.add(m);
    return m;
  };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 12, 24);
  const sph = (r) => new THREE.SphereGeometry(r, 32, 24);

  // legs and feet
  for (const s of [-1, 1]) {
    const x = s * 0.3;
    mesh(cap(0.2, 0.5), shell, body, [x, 1.45, 0]);
    mesh(sph(0.2), black, body, [x, 1.0, 0]);
    mesh(cap(0.17, 0.5), shell, body, [x, 0.6, 0]);
    mesh(cap(0.16, 0.28), black, body, [x, 0.14, 0.14], [1, 1, 1]).rotation.x = Math.PI / 2;
  }
  // hips and waist
  mesh(sph(0.5), black, body, [0, 1.98, 0], [1.1, 0.5, 0.7]);
  mesh(new THREE.CylinderGeometry(0.5, 0.46, 0.26, 40), black, body, [0, 2.3, 0], [1.1, 1, 0.72]);
  mesh(sph(0.045), glow, body, [0, 2.3, 0.37]);
  const waistLight = body.children[body.children.length - 1];

  // torso
  mesh(cap(0.5, 0.75), shell, body, [0, 2.95, 0], [1.12, 1, 0.72]);
  for (const s of [-1, 1]) { // black harness straps
    mesh(new THREE.BoxGeometry(0.1, 0.95, 0.5), black, body, [s * 0.5, 3.1, 0.0]).rotation.z = s * -0.08;
  }
  mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.22, 32), black, body, [0, 3.62, 0], [1, 1, 0.7]);

  // neck and head
  mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 24), black, body, [0, 3.8, 0]);
  const head = new THREE.Group();
  head.position.set(0, 4.3, 0);
  body.add(head);
  const A = 0.42, B = 0.58, C = 0.46;
  mesh(sph(1), black, head, [0, 0, 0], [A, B, C]);
  const surf = (u, w, k = 1.012) => new THREE.Vector3(
    A * k * Math.sin(u) * Math.sin(w), B * k * Math.cos(u), C * k * Math.sin(u) * Math.cos(w));
  const edgeCurve = (u0, u1, w0, w1) => new THREE.CatmullRomCurve3(
    Array.from({ length: 24 }, (_, i) => {
      const t = i / 23;
      return surf(u0 + (u1 - u0) * t, w0 + (w1 - w0) * Math.pow(t, 1.4));
    }));
  mesh(new THREE.TubeGeometry(edgeCurve(0.3, 2.55, -0.55, -0.1), 64, 0.014, 8), glow, head);
  const stripe = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  mesh(new THREE.TubeGeometry(edgeCurve(0.85, 1.35, 0.62, 0.7), 24, 0.008, 6), stripe, head);

  // arms (pivot at the shoulder; forearm pivots at the elbow)
  const makeArm = (s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.8, 3.45, 0);
    body.add(shoulder);
    mesh(sph(0.27), shell, shoulder);
    mesh(new THREE.TorusGeometry(0.27, 0.035, 12, 32, Math.PI), black, shoulder, [0, 0.02, 0]).rotation.set(0, 0, 0);
    mesh(cap(0.17, 0.5), shell, shoulder, [0, -0.5, 0]);
    mesh(sph(0.15), black, shoulder, [0, -0.92, 0]);
    const fore = new THREE.Group();
    fore.position.set(0, -0.92, 0);
    shoulder.add(fore);
    mesh(cap(0.15, 0.48), shell, fore, [0, -0.45, 0]);
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 20), black, fore, [0, -0.86, 0]);
    mesh(new THREE.BoxGeometry(0.2, 0.26, 0.12), joint, fore, [0, -1.0, 0]);
    for (let i = -1; i <= 1; i++) {
      mesh(cap(0.025, 0.1), joint, fore, [i * 0.06, -1.2, 0]);
    }
    return { shoulder, fore };
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  leftArm.shoulder.rotation.z = -0.1;
  rightArm.shoulder.rotation.z = 0.1;

  // soft ground glow
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 48),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // views
  const views = { front: [0, 0.12], side: [-Math.PI / 2, 0.12], back: [Math.PI, 0.12], top: [0.5, 0.85] };
  let mode = 'auto';
  let target = 0.25;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pitch = 0.12;
  let targetPitch = 0.12;

  const setMode = (m) => {
    mode = m;
    if (views[m]) { target = views[m][0]; targetPitch = views[m][1]; } else if (m === 'auto') targetPitch = 0.12;
    controls?.querySelectorAll('button[data-view]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.view === m));
    });
  };

  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; targetPitch = pitch; el.setPointerCapture(e.pointerId);
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

  // sizing
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

  // animation
  const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
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
    camera.position.set(0.5, 2.15 + Math.sin(pitch) * 13.5, Math.cos(pitch) * 13.5);
    camera.lookAt(0.5, 2.15, 0);

    body.position.y = Math.sin(t * 1.5) * 0.06 + 0.06;
    ground.scale.setScalar(1 - Math.sin(t * 1.5) * 0.05);
    head.rotation.y = Math.sin(t * 0.9) * 0.08;
    head.rotation.x = pitch * 0.3;

    const p = (t % 4) / 4;
    const raise = smooth(0, 0.14, p) * (1 - smooth(0.8, 0.92, p));
    rightArm.shoulder.rotation.z = 0.1 + raise * 2.6;
    rightArm.fore.rotation.z = raise * Math.sin(p * Math.PI * 10) * 0.45;
    rightArm.fore.rotation.x = -raise * 0.2;
    leftArm.shoulder.rotation.z = -0.1 + Math.sin(t * 1.5) * 0.02;

    const pulse = 1.8 + Math.sin(t * 2.8) * 0.9;
    glow.emissiveIntensity = reduceMotion ? 2.2 : pulse;
    waistLight.scale.setScalar(1 + (pulse - 1.8) * 0.15);

    renderer.render(scene, camera);
  };
  frame();
}
