import * as THREE from './three.module.min.js';

// 3D hero robot: a slim business humanoid. Satin white armour panels over a dark
// under-suit, with a black face shield. The body is sculpted from lofted
// cross-sections rather than stock primitives, so it has human proportions.
// If WebGL or this module fails, the inline SVG fallback stays visible.
const host = document.getElementById('robot3d');

// ---- lofting -------------------------------------------------------------
// A profile is a list of cross-sections [y, rx, rz, cz = 0, n = 2]: a superellipse
// of half-width rx, half-depth rz, pushed forward by cz, with exponent n
// (2 = ellipse, higher = boxier). Sections are interpolated smoothly in y.
function profile(secs) {
  const s = secs.map((a) => [a[0], a[1], a[2], a[3] ?? 0, a[4] ?? 2]).sort((a, b) => a[0] - b[0]);
  const n = s.length;
  const slope = (k, c) => {
    const fwd = k < n - 1 ? (s[k + 1][c] - s[k][c]) / (s[k + 1][0] - s[k][0]) : null;
    const back = k > 0 ? (s[k][c] - s[k - 1][c]) / (s[k][0] - s[k - 1][0]) : null;
    return fwd === null ? back : back === null ? fwd : (fwd + back) / 2;
  };
  const at = (y) => {
    let k = 0;
    while (k < n - 2 && y > s[k + 1][0]) k++;
    const h = s[k + 1][0] - s[k][0];
    const t = Math.min(Math.max((y - s[k][0]) / h, 0), 1);
    const t2 = t * t, t3 = t2 * t;
    const out = [];
    for (let c = 1; c < 5; c++) {
      out.push((2 * t3 - 3 * t2 + 1) * s[k][c] + (t3 - 2 * t2 + t) * h * slope(k, c)
        + (-2 * t3 + 3 * t2) * s[k + 1][c] + (t3 - t2) * h * slope(k + 1, c));
    }
    return out;
  };
  return { at, y0: s[0][0], y1: s[n - 1][0] };
}

// Surface of a profile. `half` (radians, or a function of the 0..1 height) limits it to
// a panel centred on angle `mid` (0 = front, PI/2 = +x); `grow` lifts it off the surface.
function loft(prof, { y0 = prof.y0, y1 = prof.y1, half = Math.PI, mid = 0, grow = 0, seg = 56, rows = 40 } = {}) {
  const full = half === Math.PI;
  const cols = full ? seg : seg + 1;
  const pos = [];
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    const y = y0 + (y1 - y0) * (0.5 - 0.5 * Math.cos(Math.PI * v)); // denser at the ends
    const [rx, rz, cz, n] = prof.at(y);
    const h = typeof half === 'function' ? half(v) : half;
    const e = 2 / n;
    for (let j = 0; j < cols; j++) {
      const th = mid - h + (2 * h * j) / seg;
      const sn = Math.sin(th), cs = Math.cos(th);
      pos.push(
        Math.max(rx + grow, 1e-4) * Math.sign(sn) * Math.pow(Math.abs(sn), e), y,
        cz + Math.max(rz + grow, 1e-4) * Math.sign(cs) * Math.pow(Math.abs(cs), e));
    }
  }
  const idx = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j, b = (i + 1) * cols + j;
      const c = i * cols + ((j + 1) % cols), d = (i + 1) * cols + ((j + 1) % cols);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// panel outline with rounded corners: full width in the middle, tapering at top and bottom
const panel = (h, k = 0.22, p = 6) => (v) => h * (1 - k * Math.pow(Math.abs(2 * v - 1), p));

function init(host) {
  const stage = host.querySelector('[data-robot-stage]');
  const fallback = stage.querySelector('svg');
  const accent = new THREE.Color(host.dataset.accent || '#5EEAD4');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D humanoid robot. Drag to rotate.');
  Object.assign(renderer.domElement.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    cursor: 'grab', touchAction: 'pan-y'
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 0.8, 0.05, 50);

  // ---- studio reflections (soft boxes baked into an environment map) ----
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.065, 0.11), side: THREE.BackSide })));
    const box = (w, h, pos, rgb) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
    };
    box(12, 5, [-3, 12, 5], [5, 5, 5]);                                 // overhead key
    box(3, 12, [11, 2, 7], [5, 5.4, 6]);                                 // right strip
    box(3, 12, [-11, 2, 5], [1.6, 1.9, 2.6]);                            // left strip
    box(9, 4, [-6, 2, -11], [accent.r * 5, accent.g * 5, accent.b * 5]); // brand kicker
    box(6, 4, [8, 3, -10], [1.6, 1.7, 4.5]);                             // indigo kicker
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture;
    pm.dispose();
  }

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b1020, 0.22));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-3.5, 4, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(accent, 3.2);
  rim.position.set(-4, 2.5, -3.5);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x7c83ff, 2.2);
  rim2.position.set(4.5, 2, -3);
  scene.add(rim2);

  // ---- materials ----
  const armor = new THREE.MeshPhysicalMaterial({ color: 0xd4d8df, roughness: 0.42, metalness: 0.16, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.7, side: THREE.DoubleSide });
  const suit = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.7 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x262b34, roughness: 0.36, metalness: 0.9, envMapIntensity: 1.0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.25, metalness: 1, envMapIntensity: 1.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x020409, roughness: 0.08, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.5, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, side: THREE.DoubleSide });

  const rig = new THREE.Group();   // yaw, set by drag
  const body = new THREE.Group();  // idle sway
  rig.add(body);
  scene.add(rig);

  // ---- helpers ----
  const mesh = (geo, mat, parent, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
    parent.add(m);
    return m;
  };
  const group = (parent, pos) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };
  const sph = (r = 1, seg = 32) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 8, 16);
  const cyl = (r, h, seg = 32) => new THREE.CylinderGeometry(r, r, h, seg);
  const ring = (r, t) => new THREE.TorusGeometry(r, t, 10, 48);
  const HALF = Math.PI / 2;

  // ---- torso ----
  const T = profile([
    [0.845, 0.03, 0.03, 0, 2.4], [0.875, 0.112, 0.082, 0, 2.4], [0.93, 0.146, 0.098, 0, 2.5],
    [0.99, 0.148, 0.098, 0, 2.5], [1.05, 0.134, 0.09, 0, 2.4], [1.11, 0.124, 0.084, 0, 2.4],
    [1.2, 0.146, 0.098, 0.004, 2.5], [1.31, 0.182, 0.118, 0.008, 2.7], [1.4, 0.19, 0.116, 0.004, 2.8],
    [1.455, 0.172, 0.1, 0, 2.6], [1.49, 0.11, 0.074, -0.004, 2.3], [1.512, 0.05, 0.05, -0.006, 2]
  ]);
  mesh(loft(T, { rows: 64 }), suit, body);
  const chest = group(body, [0, 0, 0]);
  mesh(loft(T, { y0: 1.222, y1: 1.497, half: panel(1.2, 0.3), grow: 0.007, rows: 48 }), armor, chest);          // chest plate
  mesh(loft(T, { y0: 1.215, y1: 1.497, half: panel(1.3, 0.3), mid: Math.PI, grow: 0.007, rows: 48 }), armor, chest); // back plate
  mesh(loft(T, { y0: 1.165, y1: 1.207, half: panel(0.8, 0.3, 4), grow: 0.006, rows: 12 }), armor, body);         // abdominal plates
  mesh(loft(T, { y0: 1.112, y1: 1.154, half: panel(0.74, 0.3, 4), grow: 0.006, rows: 12 }), armor, body);
  mesh(loft(T, { y0: 1.059, y1: 1.101, half: panel(0.7, 0.3, 4), grow: 0.006, rows: 12 }), armor, body);
  const vee = (h) => (v) => h * (0.3 + 0.7 * Math.pow(v, 0.7)) * (1 - 0.25 * Math.pow(v, 8));
  mesh(loft(T, { y0: 0.885, y1: 1.04, half: vee(1.05), grow: 0.007, rows: 28 }), armor, body);                    // pelvis plates
  mesh(loft(T, { y0: 0.9, y1: 1.04, half: vee(1.2), mid: Math.PI, grow: 0.007, rows: 28 }), armor, body);
  // chest status light, set into the plate
  mesh(loft(T, { y0: 1.396, y1: 1.404, half: 0.16, mid: 0.42, grow: 0.0085, rows: 2, seg: 12 }), glow, chest);
  mesh(loft(T, { y0: 1.34, y1: 1.343, half: 0.95, grow: 0.0078, rows: 2, seg: 32 }), suit, chest);                // chest seam

  // ---- neck ----
  mesh(cyl(0.046, 0.1), suit, body, [0, 1.55, -0.008]);
  for (let i = 0; i < 3; i++) mesh(ring(0.047, 0.006), joint, body, [0, 1.528 + i * 0.02, -0.008], [1, 1, 1], [HALF, 0, 0]);
  mesh(ring(0.062, 0.008), steel, body, [0, 1.508, -0.006], [1, 1.05, 1], [HALF, 0, 0]);

  // ---- head ----
  const head = group(body, [0, 1.672, 0]);
  const H = profile([
    [-0.128, 0.004, 0.004, 0.012, 2.2], [-0.118, 0.04, 0.044, 0.012, 2.2], [-0.092, 0.062, 0.07, 0.008, 2.3],
    [-0.04, 0.078, 0.09, 0.002, 2.3], [0.02, 0.083, 0.098, 0, 2.3], [0.07, 0.078, 0.093, -0.002, 2.2],
    [0.105, 0.058, 0.07, -0.004, 2.1], [0.122, 0.03, 0.036, -0.004, 2], [0.128, 0.004, 0.004, -0.004, 2]
  ]);
  mesh(loft(H, { rows: 56, seg: 64 }), armor, head);
  // face shield: wide at the brow, tapering to the chin
  const face = (v) => (0.62 + 0.62 * Math.pow(Math.sin(Math.min(v * 1.25, 1) * HALF), 0.8)) * (1 - 0.5 * Math.pow(v, 9));
  mesh(loft(H, { y0: -0.112, y1: 0.088, half: face, grow: 0.0035, rows: 48, seg: 64 }), glass, head);
  const eyes = [-1, 1].map((s) =>
    mesh(loft(H, { y0: 0.012, y1: 0.022, half: 0.12, mid: s * 0.3, grow: 0.0045, rows: 2, seg: 12 }), glow, head));
  for (const s of [-1, 1]) {                                                              // sensor pods
    mesh(cyl(0.03, 0.014), joint, head, [s * 0.083, 0.005, -0.012], [1, 1, 1], [0, 0, HALF]);
    mesh(ring(0.02, 0.003), steel, head, [s * 0.091, 0.005, -0.012], [1, 1, 1], [0, HALF, 0]);
  }

  // ---- arms ----
  const UP = profile([[0.03, 0.03, 0.03], [0, 0.047, 0.05], [-0.07, 0.05, 0.054], [-0.18, 0.045, 0.047], [-0.27, 0.038, 0.039], [-0.3, 0.03, 0.03]]);
  const FORE = profile([[0.02, 0.028, 0.028], [-0.03, 0.04, 0.042], [-0.09, 0.043, 0.046], [-0.2, 0.034, 0.036], [-0.265, 0.027, 0.029], [-0.285, 0.022, 0.024]]);
  const PALM = profile([[0.012, 0.008, 0.02, 0, 3], [-0.008, 0.013, 0.03, 0, 3], [-0.04, 0.015, 0.042, 0, 3.2], [-0.085, 0.013, 0.041, 0, 3.2], [-0.097, 0.006, 0.034, 0, 3]]);
  const finger = (parent, pos, lens, r, curl, axis) => {
    let g = group(parent, pos);
    lens.forEach((len, i) => {
      g.rotation[axis] = curl * (i === 0 ? 0.6 : 1);
      mesh(cap(r * (1 - i * 0.08), len - r), i === 0 ? joint : suit, g, [0, -len / 2, 0]);
      mesh(sph(r * 1.08, 12), joint, g);
      g = group(g, [0, -len, 0]);
    });
  };
  const makeArm = (s) => {
    const sh = group(body, [s * 0.232, 1.425, -0.004]);
    mesh(sph(0.056), joint, sh);
    mesh(new THREE.SphereGeometry(0.068, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), armor, sh, [s * 0.002, -0.004, 0], [1, 0.9, 1.04], [0, 0, -s * 0.72]); // deltoid cap
    const upper = group(sh, [0, 0, 0]);
    mesh(loft(UP, { rows: 32, seg: 40 }), suit, upper);
    mesh(loft(UP, { y0: -0.085, y1: -0.255, half: panel(2.35, 0.2), mid: s * HALF, grow: 0.006, rows: 28, seg: 48 }), armor, upper);
    mesh(sph(0.039), joint, upper, [0, -0.3, 0]);                                         // elbow
    mesh(cyl(0.027, 0.088), joint, upper, [0, -0.3, 0], [1, 1, 1], [0, 0, HALF]);
    mesh(cyl(0.016, 0.092), steel, upper, [0, -0.3, 0], [1, 1, 1], [0, 0, HALF]);
    const fore = group(upper, [0, -0.3, 0]);
    mesh(loft(FORE, { rows: 32, seg: 40 }), suit, fore);
    mesh(loft(FORE, { y0: -0.04, y1: -0.245, half: panel(2.45, 0.2), mid: s * HALF, grow: 0.006, rows: 28, seg: 48 }), armor, fore);
    mesh(cyl(0.025, 0.026), joint, fore, [0, -0.287, 0]);                                 // wrist
    mesh(ring(0.026, 0.003), steel, fore, [0, -0.276, 0], [1, 1, 1], [HALF, 0, 0]);
    const hand = group(fore, [0, -0.305, 0]);
    mesh(loft(PALM, { rows: 16, seg: 32 }), joint, hand);
    mesh(loft(PALM, { y0: -0.012, y1: -0.078, half: panel(1.25, 0.3, 4), mid: s * HALF, grow: 0.003, rows: 12, seg: 24 }), armor, hand);
    [0.031, 0.0105, -0.0105, -0.031].forEach((z, i) =>
      finger(hand, [0, -0.092, z], [[0.036, 0.026, 0.02], [0.04, 0.03, 0.021], [0.038, 0.028, 0.02], [0.03, 0.021, 0.017]][i], 0.0092, -s * (0.3 + i * 0.05), 'z'));
    const th = group(hand, [-s * 0.004, -0.03, 0.04]);                                    // thumb
    th.rotation.set(0.85, 0, -s * 0.25);
    finger(th, [0, 0, 0], [0.04, 0.03, 0.024], 0.0105, -0.3, 'x');
    upper.rotation.set(0.05, 0, s * 0.1);
    fore.rotation.set(-0.3, 0, -s * 0.06);
    hand.rotation.set(-0.06, s * 0.25, 0);
    return { sh, upper, fore };
  };
  const arms = [makeArm(1), makeArm(-1)];

  // ---- legs ----
  const THIGH = profile([[0.05, 0.04, 0.04], [0, 0.074, 0.082], [-0.09, 0.08, 0.088], [-0.24, 0.066, 0.07], [-0.37, 0.052, 0.054], [-0.42, 0.04, 0.042]]);
  const SHIN = profile([[0.03, 0.036, 0.036], [-0.05, 0.052, 0.058, -0.004], [-0.14, 0.054, 0.06, -0.008], [-0.28, 0.04, 0.044, -0.004], [-0.37, 0.034, 0.036], [-0.4, 0.028, 0.03]]);
  const FOOT = profile([[-0.12, 0.004, 0.004], [-0.105, 0.036, 0.022], [-0.04, 0.046, 0.034], [0.06, 0.05, 0.03], [0.13, 0.044, 0.022], [0.15, 0.004, 0.004]]);
  for (const s of [-1, 1]) {
    const hip = group(body, [s * 0.088, 0.895, 0]);
    mesh(sph(0.07), joint, hip, [s * 0.012, 0.01, 0]);
    mesh(loft(THIGH, { rows: 32, seg: 40 }), suit, hip);
    mesh(loft(THIGH, { y0: -0.06, y1: -0.35, half: panel(2.2, 0.2), mid: s * 0.5, grow: 0.007, rows: 28, seg: 48 }), armor, hip);
    mesh(sph(0.05), joint, hip, [0, -0.415, 0]);                                          // knee
    mesh(sph(1, 24), armor, hip, [0, -0.415, 0.03], [0.044, 0.05, 0.034]);
    const shin = group(hip, [0, -0.415, 0]);
    mesh(loft(SHIN, { rows: 32, seg: 40 }), suit, shin);
    mesh(loft(SHIN, { y0: -0.07, y1: -0.35, half: panel(2.3, 0.2), grow: 0.006, rows: 28, seg: 48 }), armor, shin);
    mesh(cyl(0.03, 0.05), joint, shin, [0, -0.41, 0]);                                    // ankle
    mesh(loft(FOOT, { rows: 24, seg: 32 }), armor, shin, [0, -0.45, 0.03], [1, 1, 1], [HALF, 0, 0]);
    mesh(new THREE.BoxGeometry(0.09, 0.012, 0.25), suit, shin, [0, -0.476, 0.045]);
    hip.rotation.z = s * 0.035;
    shin.rotation.z = -s * 0.035;
  }

  // soft ground glow
  const groundTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48),
    new THREE.MeshBasicMaterial({ color: accent, map: groundTex, transparent: true, depthWrite: false }));
  ground.rotation.x = -HALF;
  scene.add(ground);

  // ---- interaction: drag to rotate, head follows the pointer ----
  const REST_YAW = 0.42;
  rig.rotation.y = REST_YAW;
  let target = REST_YAW;
  let dragging = false;
  let lastX = 0, lastY = 0;
  let pitch = 0.04, targetPitch = 0.04;
  let lookX = 0, lookY = 0, lastLook = -1e9;

  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    target += (e.clientX - lastX) * 0.01;
    targetPitch = Math.min(Math.max(targetPitch + (e.clientY - lastY) * 0.006, -0.15), 0.9);
    lastX = e.clientX; lastY = e.clientY;
  });
  const endDrag = () => { dragging = false; el.style.cursor = 'grab'; };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = stage.getBoundingClientRect();
    lookX = Math.min(Math.max((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), -1), 1);
    lookY = Math.min(Math.max((e.clientY - (r.top + r.height * 0.3)) / (window.innerHeight / 2), -1), 1);
    lastLook = performance.now();
  }, { passive: true });

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

  // ---- animation ----
  let visible = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(host);
  const clock = new THREE.Clock();
  let headYaw = -0.3, headPitch = 0;

  const frame = () => {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const t = reduceMotion ? 0 : clock.getElapsedTime();

    rig.rotation.y += (target - rig.rotation.y) * 0.08;
    pitch += (targetPitch - pitch) * 0.08;
    // portrait framing: thighs to just above the head; pull back on narrow stages
    const D = 2.85 * Math.max(1, 0.62 / camera.aspect), LY = 1.325;
    camera.position.set(0, LY + Math.sin(pitch) * D, Math.cos(pitch) * D);
    camera.lookAt(0, LY, 0);

    // idle: breathing and a slight weight shift
    const breath = Math.sin(t * 1.5);
    body.rotation.z = Math.sin(t * 0.5) * 0.008;
    body.position.y = breath * 0.002;
    chest.scale.set(1 + breath * 0.004, 1, 1 + breath * 0.012);
    for (const [i, a] of arms.entries()) {
      a.sh.position.y = 1.425 + breath * 0.0025;
      a.upper.rotation.x = 0.05 + Math.sin(t * 0.5 + i * 2) * 0.012;
    }

    // head: track the pointer while it moves, otherwise look around slowly
    const yaw = Math.atan2(Math.sin(rig.rotation.y), Math.cos(rig.rotation.y));
    const tracking = !reduceMotion && performance.now() - lastLook < 4000;
    let wantYaw = tracking ? lookX * 0.75 - yaw : -0.3 + Math.sin(t * 0.4) * 0.14;
    let wantPitch = tracking ? lookY * 0.3 : 0.02 + Math.sin(t * 0.27) * 0.03;
    if (Math.abs(wantYaw) > 1.2) { wantYaw = 0; wantPitch = 0; } // facing away: rest
    headYaw += (Math.min(Math.max(wantYaw, -0.7), 0.7) - headYaw) * 0.06;
    headPitch += (wantPitch - headPitch) * 0.06;
    head.rotation.set(headPitch + pitch * 0.3, headYaw, 0);

    // lights: slow pulse, occasional blink
    const pulse = reduceMotion ? 0 : Math.sin(t * 2.2);
    glow.color.copy(accent).multiplyScalar(0.86 + pulse * 0.14);
    const blink = reduceMotion ? 1 : 1 - Math.max(0, 1 - Math.abs(((t + 2) % 5.5) - 5.3) / 0.09);
    for (const e of eyes) e.scale.y = 0.15 + 0.85 * blink;

    renderer.render(scene, camera);
  };
  frame();
}

if (host) {
  try {
    init(host);
    host.dataset.ready = '1';
  } catch (err) {
    host.dataset.state = 'failed';
    console.warn('3D robot unavailable, using SVG fallback.', err);
  }
}
