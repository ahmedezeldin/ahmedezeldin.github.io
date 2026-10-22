// Scroll-driven 3D render of the finished Medicine Cooler design.
// Built from primitives so it loads fast; three.js is fetched only when the section nears the viewport.

const root = document.getElementById('explorer');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

if (root && hasWebGL()) {
  root.hidden = false;
  if (reduceMotion) root.classList.add('is-static');
  const near = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { near.disconnect(); start(); }
  }, { rootMargin: '100% 0px' });
  near.observe(root);
}

const STEPS = 5;           // 0 finished, 1 enclosure, 2 Peltier, 3 electronics, 4 control loop
const P_MAX = 4.6;         // extra scroll at the end plays the control loop

async function start() {
  const THREE = await import('three');
  const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

  const view = root.querySelector('.explorer-view');
  const canvas = view.querySelector('canvas');
  const labelLayer = view.querySelector('.explorer-labels');
  const stepEls = [...root.querySelectorAll('.explorer-steps li')];
  const dots = [...root.querySelectorAll('.explorer-dots button')];
  const counter = root.querySelector('.explorer-count');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(10, 30, 16);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x3a3f46, 0.45));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- Materials ----------
  const pla = (color, rough = 0.58) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const M = {
    orange: pla(0xD27A2C), teal: pla(0x4D8481), graphite: pla(0x2E3338, 0.5), grey: pla(0x8E959C),
    black: pla(0x1C1F23, 0.45),
    liner: new THREE.MeshStandardMaterial({ color: 0xEEF1F4, roughness: 0.45, emissive: 0x5aa9ff, emissiveIntensity: 0 }),
    foil: new THREE.MeshStandardMaterial({ color: 0xC9CED4, metalness: 0.9, roughness: 0.32 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xBFC5CC, metalness: 0.85, roughness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xD5D9DE, metalness: 1, roughness: 0.22 }),
    ceramic: pla(0xF3F1EC, 0.7),
    pcbBlack: pla(0x16181C, 0.5), pcbBlue: pla(0x1F4FAF, 0.5), relayBlue: pla(0x2C6FD8, 0.35),
    terminal: pla(0x2F9E5B, 0.5), wireRed: pla(0xC0392B, 0.5), wireBlack: pla(0x1A1A1A, 0.5),
    glass: new THREE.MeshStandardMaterial({ color: 0xDDEBFA, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35 }),
    fluid: new THREE.MeshStandardMaterial({ color: 0xBFE0FF, roughness: 0.1, transparent: true, opacity: 0.55 }),
    cap: pla(0xE07A1F, 0.4),
    slot: pla(0x0E1013, 0.8),
  };

  const box = (w, h, d, mat, r = 0.12) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const at = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };
  const cyl = (r, h, mat, seg = 28) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  // Open-top box made of a floor and four walls.
  function openBox(w, h, d, t, mat) {
    const g = new THREE.Group();
    g.add(at(box(w, t, d, mat), 0, t / 2, 0));
    g.add(at(box(t, h, d, mat), -w / 2 + t / 2, h / 2, 0));
    g.add(at(box(t, h, d, mat), w / 2 - t / 2, h / 2, 0));
    g.add(at(box(w - 2 * t, h, t, mat), 0, h / 2, d / 2 - t / 2));
    g.add(at(box(w - 2 * t, h, t, mat), 0, h / 2, -d / 2 + t / 2));
    return g;
  }

  // Half of the two-tone outer shell, split down the middle like the printed parts.
  function shellHalf(side, mat) {
    const g = new THREE.Group();
    const s = side; // -1 left, +1 right
    g.add(at(box(W / 2, T, D, mat), s * W / 4, T / 2, 0));
    g.add(at(box(T, H, D, mat), s * (W / 2 - T / 2), H / 2, 0));
    g.add(at(box(W / 2 - T, H, T, mat), s * (W / 4 - T / 2), H / 2, D / 2 - T / 2));
    g.add(at(box(W / 2 - T, H, T, mat), s * (W / 4 - T / 2), H / 2, -D / 2 + T / 2));
    return g;
  }

  // ---------- Model (units ≈ cm) ----------
  const W = 14, H = 12, D = 14, T = 0.6;
  const rig = new THREE.Group();
  scene.add(rig);
  rig.position.x = 0; // visually centre the assembly including the side pod and fan

  const parts = {};
  const add = (name, obj) => { parts[name] = obj; rig.add(obj); obj.userData.base = obj.position.clone(); return obj; };

  add('shellL', shellHalf(-1, M.orange));
  add('shellR', shellHalf(1, M.teal));

  const insW = W - 2 * T - 0.05, insD = D - 2 * T - 0.05, insT = 0.75;
  add('insulation', at(openBox(insW, H - T - 0.3, insD, insT, M.foil), 0, T, 0));

  // Liner with its contents: medication vials, temperature probe and the cold plate.
  const liner = new THREE.Group();
  const lW = insW - 2 * insT - 0.1, lD = insD - 2 * insT - 0.1;
  liner.add(openBox(lW, H - T - insT - 0.4, lD, 0.35, M.liner));
  for (let i = 0; i < 3; i++) {
    const v = new THREE.Group();
    v.add(at(cyl(0.75, 3.4, M.glass), 0, 1.7, 0));
    v.add(at(cyl(0.62, 2.4, M.fluid), 0, 1.3, 0));
    v.add(at(cyl(0.6, 0.6, M.cap), 0, 3.7, 0));
    v.position.set(-2.2 + i * 2.0, 0.35, -0.6 + (i % 2) * 1.4);
    liner.add(v);
  }
  const probe = at(cyl(0.22, 2.6, M.steel), 1.2, 0.9, 2.6);
  probe.rotation.z = Math.PI / 2;
  liner.add(probe);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.1, 0.9, 2.6), new THREE.Vector3(-1.4, 1.2, 2.9),
    new THREE.Vector3(-lW / 2 + 0.6, 3.5, 2.2), new THREE.Vector3(-lW / 2 + 0.25, 6.5, 1.5)
  ]), 40, 0.09, 8), M.wireBlack);
  cable.castShadow = true;
  liner.add(cable);
  const coldPlate = at(box(0.35, 4, 4, M.alu, 0.05), lW / 2 - 0.4, 5.2, 0);
  liner.add(coldPlate);
  add('liner', at(liner, 0, T + insT, 0));
  parts.probe = probe; parts.vials = liner.children[2];

  // Cold interior glow, visible when the lid is lifted during the control-loop step.
  const coldLight = new THREE.PointLight(0x7fc4ff, 0, 18, 1.6);
  coldLight.position.set(0, 7, 0);
  liner.add(coldLight);

  // Lid: printed cap with an insulating layer underneath and a grip.
  const lid = new THREE.Group();
  lid.add(at(box(W + 0.3, 1.0, D + 0.3, M.graphite, 0.25), 0, 0.5, 0));
  lid.add(at(box(insW - 0.2, 0.5, insD - 0.2, M.foil, 0.05), 0, -0.25, 0));
  lid.add(at(box(5, 0.5, 1.4, M.graphite, 0.25), 0, 1.2, 0));
  add('lid', at(lid, 0, H, 0));

  // Peltier stack on the right wall: module, heat sink, fan.
  const peltier = new THREE.Group();
  peltier.add(box(0.45, 4, 4, M.ceramic, 0.04));
  const lead = (mat, z) => {
    const w = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -2, z), new THREE.Vector3(0.4, -3, z), new THREE.Vector3(0.6, -4.2, z * 2)
    ]), 16, 0.07, 6), mat);
    w.castShadow = true; return w;
  };
  peltier.add(lead(M.wireRed, 0.6), lead(M.wireBlack, -0.6));
  add('peltier', at(peltier, W / 2 + 0.23, 6, 0));

  const sink = new THREE.Group();
  sink.add(at(box(0.6, 7.4, 7.4, M.alu, 0.06), 0, 0, 0));
  for (let i = 0; i < 11; i++) sink.add(at(box(2.3, 7.2, 0.16, M.alu, 0.03), 1.4, 0, -3.5 + i * 0.7));
  add('sink', at(sink, W / 2 + 0.75, 6, 0));

  const fan = new THREE.Group();
  const frameT = 0.75;
  fan.add(at(box(2.4, frameT, 8, M.black, 0.1), 0, 4 - frameT / 2, 0));
  fan.add(at(box(2.4, frameT, 8, M.black, 0.1), 0, -4 + frameT / 2, 0));
  fan.add(at(box(2.4, 8, frameT, M.black, 0.1), 0, 0, 4 - frameT / 2));
  fan.add(at(box(2.4, 8, frameT, M.black, 0.1), 0, 0, -4 + frameT / 2));
  const hub = cyl(1.3, 2.0, M.black); hub.rotation.z = Math.PI / 2; fan.add(hub);
  const blades = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const b = box(0.12, 2.6, 1.3, M.black, 0.05);
    b.position.y = 2.2; b.rotation.y = 0.45;
    const arm = new THREE.Group(); arm.add(b); arm.rotation.x = (i / 7) * Math.PI * 2;
    blades.add(arm);
  }
  fan.add(blades);
  for (const r of [1.7, 2.7, 3.6]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 48), M.steel);
    ring.rotation.y = Math.PI / 2; ring.position.x = 1.25; fan.add(ring);
  }
  add('fan', at(fan, W / 2 + 4.45, 6, 0));

  // Electronics pod bonded to the left wall: black tray + grey control-unit cover with the OLED.
  const podW = 5, podX = -W / 2 - podW / 2 - 0.02;
  add('tray', at(openBox(podW, 5, 12, 0.45, M.black), podX, 0, 0));

  const cover = new THREE.Group();
  cover.add(box(podW, 4, 12, M.grey, 0.3));
  for (let i = 0; i < 2; i++) {
    const slot = box(0.1, 0.45, 6.5, M.slot, 0.08);
    slot.position.set(-podW / 2 - 0.01, -0.6 - i * 1.1, 1.8);
    cover.add(slot);
  }
  // OLED module window on the outward face.
  const oledCanvas = document.createElement('canvas');
  oledCanvas.width = 512; oledCanvas.height = 256;
  const oledTex = new THREE.CanvasTexture(oledCanvas);
  oledTex.colorSpace = THREE.SRGBColorSpace;
  const oled = new THREE.Group();
  oled.add(box(0.2, 2.9, 3.0, M.pcbBlue, 0.04));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.45),
    new THREE.MeshBasicMaterial({ map: oledTex, toneMapped: false }));
  screen.rotation.y = -Math.PI / 2;
  screen.position.x = -0.11;
  oled.add(screen);
  oled.position.set(-podW / 2 - 0.02, 0.3, -3.2);
  cover.add(oled);
  add('cover', at(cover, podX, 7, 0));

  // Components inside the tray.
  const esp = new THREE.Group();
  esp.add(box(2.8, 0.16, 5.4, M.pcbBlack, 0.04));
  esp.add(at(box(1.7, 0.32, 1.9, M.steel, 0.04), 0, 0.22, -1.2));
  esp.add(at(box(0.9, 0.3, 0.6, M.steel, 0.05), 0, 0.2, 2.55));
  esp.add(at(box(0.25, 0.5, 4.6, M.black, 0.03), -1.25, -0.3, 0.2));
  esp.add(at(box(0.25, 0.5, 4.6, M.black, 0.03), 1.25, -0.3, 0.2));
  add('esp', at(esp, podX, 1.3, -2.4));

  const relay = new THREE.Group();
  relay.add(box(1.9, 0.16, 4.2, M.pcbBlue, 0.04));
  relay.add(at(box(1.5, 1.5, 1.9, M.relayBlue, 0.08), 0, 0.85, -0.6));
  relay.add(at(box(1.1, 0.9, 1.5, M.terminal, 0.06), 0, 0.55, 1.4));
  const relayLed = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2a2a, emissiveIntensity: 0 }));
  relayLed.position.set(0.6, 0.18, 0.4);
  relay.add(relayLed);
  add('relay', at(relay, podX, 1.0, 3.0));

  const buzzer = new THREE.Group();
  buzzer.add(cyl(0.6, 0.8, M.black));
  buzzer.add(at(cyl(0.12, 0.05, M.slot, 12), 0, 0.42, 0));
  add('buzzer', at(buzzer, podX + 1.2, 1.2, 0.6));

  // ---------- Exploded offsets per step (rig-local) ----------
  const OFF = {
    // Enclosure layers lift out of the shell as a vertical stack.
    insulation: { 1: [0, 7.5, 0] },
    liner:      { 1: [0, 15.5, 0] },
    lid:        { 1: [0, 25, -1], 4: [0, 3.2, -1.5] },
    peltier:    { 2: [3.2, 0, 0] },
    sink:       { 2: [7.0, 0, 0] },
    fan:        { 2: [12.0, 0, 0] },
    tray:       { 3: [-3.5, 0, 0] },
    cover:      { 3: [-3.5, 9.5, 0] },
    esp:        { 3: [-3.5, 5.6, -1.6] },
    relay:      { 3: [-3.5, 5.6, 1.4] },
    buzzer:     { 3: [-4.7, 3.0, -0.6] },
  };
  // Lid also lifts for the Peltier/electronics steps so the interior isn't hidden behind it.
  const LID_ROT = { 4: -0.18 };

  // Camera + model orientation keyframes per step.
  const KF = {
    rot:  [0.62, 0.35, -0.3, 1.15, 0.5],
    elev: [0.5, 0.75, 0.4, 0.45, 0.95],
    dist: [0.92, 1.65, 1.5, 1.0, 1.0],
    // Point the camera at (rig-local x, y) for each step.
    fx:   [0, 0, 6.5, -11, 0],
    fy:   [5.5, 15, 6.5, 8.5, 7],
    // Horizontal screen shift (fraction of width) that leaves room for the caption.
    sx:   [0.2, 0.18, 0, -0.2, 0.2],
  };

  // Each step's caption sits beside the part it describes.
  const CAPTIONS = [
    { part: 'shellR', dx: 10, dy: 6, side: 'right' },
    { part: 'liner', dx: 11, dy: 4, side: 'right' },
    { part: 'sink', dx: 1.5, dy: -5, side: 'below' },
    { part: 'tray', dz: -6.5, dy: 3, side: 'left' },
    { part: 'shellR', dx: 13, dy: 8, side: 'right' },
  ];
  let capSizes = [];
  const measureCaptions = () => { capSizes = stepEls.map(el => [el.offsetWidth, el.offsetHeight]); };

  // Labels anchored to parts.
  const LABELS = [
    { part: 'lid', step: 1, en: 'Insulated lid', ar: 'غطاء معزول', dy: 1.6 },
    { part: 'shellL', step: 1, en: 'Printed outer shell', ar: 'الغلاف الخارجي المطبوع', dx: -9, dy: 8, dz: 4 },
    { part: 'insulation', step: 1, en: 'Insulation layer', ar: 'طبقة العزل', dx: -10, dy: 5, dz: 2 },
    { part: 'liner', step: 1, en: 'Inner liner', ar: 'البطانة الداخلية', dx: -9.5, dy: 6, dz: 2 },
    { part: 'peltier', step: 2, en: 'Peltier module', ar: 'وحدة بلتييه', dy: -2.6 },
    { part: 'sink', step: 2, en: 'Heat sink', ar: 'مشتت الحرارة', dx: 1.4, dy: 4.4 },
    { part: 'fan', step: 2, en: 'Fan', ar: 'المروحة', dy: 4.8 },
    { part: 'cover', step: 3, en: 'Control unit + OLED', ar: 'وحدة التحكم + شاشة OLED', dy: 2.6 },
    { part: 'esp', step: 3, en: 'ESP32', ar: 'ESP32', dy: 1.0 },
    { part: 'relay', step: 3, en: 'Relay', ar: 'المرحّل', dy: 2.2 },
    { part: 'buzzer', step: 3, en: 'Buzzer', ar: 'الصفارة', dy: -0.9, dx: -0.6 },
    { part: 'tray', step: 3, en: 'Electronics bay', ar: 'حجيرة الإلكترونيات', dx: -2.6, dy: -0.6 },
  ];
  const labelEls = LABELS.map(l => {
    const el = document.createElement('div');
    el.className = 'x-label';
    labelLayer.appendChild(el);
    return el;
  });
  function setLabelText() {
    const ar = document.documentElement.lang === 'ar';
    LABELS.forEach((l, i) => { labelEls[i].textContent = ar ? l.ar : l.en; });
  }
  setLabelText();
  new MutationObserver(() => { setLabelText(); measureCaptions(); dirty = true; })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  // Readable mirror of the OLED inside the control-loop caption.
  const hud = root.querySelector('.explorer-hud');
  let lastHud = '';
  function updateHud(temp, cooling, alert) {
    const ar = document.documentElement.lang === 'ar';
    const t = ar
      ? { temp: 'الحرارة', target: 'المستهدف', relay: 'المرحّل', buzzer: 'الصفارة', on: 'يعمل', off: 'متوقف', alarm: 'تنبيه' }
      : { temp: 'Temp', target: 'Target', relay: 'Relay', buzzer: 'Buzzer', on: 'ON', off: 'OFF', alarm: 'ALERT' };
    const html =
      `<div><span>${t.temp}</span><b dir="ltr">${temp.toFixed(1)} °C</b></div>` +
      `<div><span>${t.target}</span><b dir="ltr">2–8 °C</b></div>` +
      `<div><span>${t.relay}</span><b class="${cooling ? 'on' : ''}">${cooling ? t.on : t.off}</b></div>` +
      `<div><span>${t.buzzer}</span><b class="${alert ? 'warn' : ''}">${alert ? t.alarm : t.off}</b></div>`;
    if (html !== lastHud) { hud.innerHTML = html; lastHud = html; }
  }

  // ---------- OLED ----------
  let lastOled = '';
  function drawOled(temp, status, alert) {
    const sig = temp.toFixed(1) + status + alert;
    if (sig === lastOled) return;
    lastOled = sig;
    const g = oledCanvas.getContext('2d');
    g.fillStyle = '#02060a'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#5fd0ff';
    g.font = '600 40px ui-monospace, Menlo, Consolas, monospace';
    g.fillText('Medicine Cooler', 22, 54);
    g.font = '700 92px ui-monospace, Menlo, Consolas, monospace';
    g.fillText(temp.toFixed(1) + ' C', 22, 158);
    g.font = '600 34px ui-monospace, Menlo, Consolas, monospace';
    g.fillStyle = alert ? '#ffb347' : '#5fd0ff';
    g.fillText('STATUS: ' + status, 22, 222);
    oledTex.needsUpdate = true;
  }

  // ---------- Animation ----------
  const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  function weight(p, s) {
    const rise = smooth((p - (s - 0.7)) / 0.5);
    const fall = s === 4 ? 0 : smooth((p - (s + 0.3)) / 0.5);
    return rise * (1 - fall);
  }
  function kf(arr, p) {
    const q = Math.min(Math.max(p, 0), STEPS - 1);
    const i = Math.floor(q), f = smooth(q - i);
    return arr[i] + (arr[Math.min(i + 1, STEPS - 1)] - arr[i]) * f;
  }

  function progress() {
    if (root.classList.contains('is-static')) return 0;
    const r = root.getBoundingClientRect();
    const span = r.height - root.querySelector('.explorer-stage').offsetHeight;
    return Math.min(1, Math.max(0, -r.top / Math.max(span, 1))) * P_MAX;
  }

  let pNow = progress(), dirty = true, running = false, last = performance.now();
  let activeStep = -1;
  const v = new THREE.Vector3(), lookAt = new THREE.Vector3(), Y_AXIS = new THREE.Vector3(0, 1, 0);

  function setStep(i) {
    if (i === activeStep) return;
    activeStep = i;
    stepEls.forEach((el, k) => el.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => {
      if (k === i) d.setAttribute('aria-current', 'step');
      else d.removeAttribute('aria-current');
    });
    if (counter) counter.textContent = (i + 1) + ' / ' + STEPS;
  }

  function update(p, dt) {
    const w = [0, weight(p, 1), weight(p, 2), weight(p, 3), weight(p, 4)];

    for (const [name, steps] of Object.entries(OFF)) {
      const obj = parts[name], b = obj.userData.base;
      let x = 0, y = 0, z = 0;
      for (const [s, o] of Object.entries(steps)) { x += o[0] * w[s]; y += o[1] * w[s]; z += o[2] * w[s]; }
      obj.position.set(b.x + x, b.y + y, b.z + z);
    }
    parts.lid.rotation.x = LID_ROT[4] * w[4];

    // Control loop: illustrative temperature trace over the last stretch of scroll.
    const q = smooth((p - 3.7) / 0.85);
    let temp = 5.0, status = 'IN RANGE', alert = false, cooling = false;
    if (w[4] > 0.5) {
      temp = 11.5 - q * 6.5;
      if (temp > 8) { status = 'HIGH - COOLING'; alert = true; cooling = true; }
      else if (temp > 5.05) { status = 'COOLING ON'; cooling = true; }
    }
    drawOled(temp, status, alert);
    relayLed.material.emissiveIntensity = cooling ? 2.2 : 0;
    M.liner.emissiveIntensity = cooling ? 0.35 * w[4] : 0.08 * w[4];
    updateHud(temp, cooling, alert);
    coldLight.intensity = cooling ? 40 * w[4] : 6 * w[4];
    if (cooling && !reduceMotion) blades.rotation.x += dt * 14;

    // Camera framing; docked captions push the model up instead of sideways.
    const aspect = camera.aspect;
    const base = 82 * Math.max(1, 0.75 / aspect);
    const dist = base * kf(KF.dist, p);
    const docked = root.classList.contains('is-docked');
    const sx = docked ? 0 : kf(KF.sx, p), sy = docked ? 0.19 : 0;
    camera.setViewOffset(viewW, viewH, sx * viewW, sy * viewH, viewW, viewH);
    rig.rotation.y = kf(KF.rot, p);
    lookAt.set(kf(KF.fx, p), kf(KF.fy, p), 0).applyAxisAngle(Y_AXIS, rig.rotation.y);
    camera.position.set(0, kf(KF.elev, p), 1).normalize().multiplyScalar(dist).add(lookAt);
    camera.lookAt(lookAt);

    setStep(Math.min(STEPS - 1, Math.round(Math.min(p, 4))));

    // Labels.
    const rect = canvas.getBoundingClientRect();
    rig.updateMatrixWorld(true);
    LABELS.forEach((l, i) => {
      const el = labelEls[i];
      const on = w[l.step] > 0.75;
      el.classList.toggle('is-on', on);
      parts[l.part].getWorldPosition(v);
      v.add(new THREE.Vector3(l.dx || 0, l.dy || 0, l.dz || 0).applyAxisAngle(Y_AXIS, rig.rotation.y));
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * rect.width, y = (-v.y * 0.5 + 0.5) * rect.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    });

    // Captions follow their anchor point, clamped inside the view.
    if (!docked && !root.classList.contains('is-static')) {
      CAPTIONS.forEach((c, i) => {
        const [cw, ch] = capSizes[i] || [0, 0];
        parts[c.part].getWorldPosition(v);
        v.add(new THREE.Vector3(c.dx || 0, c.dy || 0, c.dz || 0).applyAxisAngle(Y_AXIS, rig.rotation.y));
        v.project(camera);
        const ax = (v.x * 0.5 + 0.5) * viewW, ay = (-v.y * 0.5 + 0.5) * viewH, gap = 28;
        let x = ax + gap, y = ay - ch / 2;
        if (c.side === 'left') x = ax - gap - cw;
        if (c.side === 'below') { x = ax - cw / 2; y = ay + gap; }
        x = Math.min(Math.max(x, 0), viewW - cw);
        y = Math.min(Math.max(y, 48), viewH - ch - 56);
        stepEls[i].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
    }

    return cooling;
  }

  let viewW = 1, viewH = 1;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    viewW = w; viewH = h;
    root.classList.toggle('is-docked', w < 720);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    measureCaptions();
    dirty = true;
  }
  new ResizeObserver(resize).observe(view);
  resize();

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const target = progress();
    const diff = target - pNow;
    pNow = reduceMotion ? target : pNow + diff * Math.min(1, dt * 7);
    const moving = Math.abs(diff) > 0.0005;
    const animating = update(pNow, dt);
    if (moving || animating || dirty) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(frame);
  }

  new IntersectionObserver(entries => {
    const visible = entries.some(e => e.isIntersecting);
    if (visible && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    if (!visible) running = false;
  }).observe(root);

  // Step dots jump to that step's scroll position.
  dots.forEach((d, i) => d.addEventListener('click', () => {
    const r = root.getBoundingClientRect();
    const span = r.height - root.querySelector('.explorer-stage').offsetHeight;
    const top = window.scrollY + r.top + (i / P_MAX) * span + (i === STEPS - 1 ? span * 0.12 : 0);
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }));

  update(pNow, 0);
  measureCaptions();
  update(pNow, 0);
  renderer.render(scene, camera);
  root.classList.add('is-ready', 'is-placed');
}
