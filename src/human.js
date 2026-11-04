// Realistic humans: one skinned body mesh (smooth deformation at every joint), a sculpted head with
// eyeballs and blinking eyelids, strand-card hair and beards, and hands with fingers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { skinFaceMaterial, eyeMaterial, hairCardMaterial, hairMaterial, FACE } from './charTex.js';

const geoCache = new Map();
const G_ = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lathe = (pts, seg = 20, zs = 1) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, Math.PI, Math.PI * 2); if (zs !== 1) g.scale(1, 1, zs); return g; };

// ------------------------------------------------------------------ body shapes (bone-local, listed bottom → top)
const SHAPES = {
  male: {
    torso: [[0.165, -0.1], [0.172, 0.0], [0.162, 0.1], [0.17, 0.2], [0.192, 0.3], [0.212, 0.39], [0.222, 0.46], [0.214, 0.52], [0.17, 0.58], [0.1, 0.625], [0.06, 0.65]], tz: 0.66, sh: 0.215,
    thigh: [[0.074, -0.44], [0.082, -0.38], [0.098, -0.24], [0.112, -0.1], [0.11, 0.03]],
    shin: [[0.052, -0.42], [0.058, -0.36], [0.075, -0.22], [0.072, -0.1], [0.07, 0.03]],
    upper: [[0.046, -0.31], [0.05, -0.27], [0.058, -0.17], [0.064, -0.06], [0.07, 0.01]],
    fore: [[0.034, -0.28], [0.038, -0.24], [0.05, -0.12], [0.052, -0.04], [0.046, 0.02]],
    hips: [0.17, 0.11, 0.12],
  },
  female: {
    torso: [[0.178, -0.1], [0.172, 0.0], [0.142, 0.11], [0.15, 0.2], [0.178, 0.29], [0.188, 0.36], [0.18, 0.44], [0.17, 0.5], [0.14, 0.565], [0.088, 0.61], [0.052, 0.635]], tz: 0.7, sh: 0.188,
    thigh: [[0.068, -0.43], [0.076, -0.37], [0.098, -0.22], [0.118, -0.08], [0.118, 0.03]],
    shin: [[0.046, -0.41], [0.052, -0.35], [0.068, -0.21], [0.064, -0.09], [0.064, 0.03]],
    upper: [[0.04, -0.29], [0.043, -0.25], [0.05, -0.15], [0.056, -0.05], [0.06, 0.01]],
    fore: [[0.03, -0.26], [0.033, -0.22], [0.043, -0.11], [0.045, -0.04], [0.04, 0.02]],
    hips: [0.18, 0.115, 0.13],
  },
};
const BOOT = [[0.0, -0.47], [0.066, -0.47], [0.078, -0.44], [0.076, -0.32], [0.084, -0.2], [0.088, -0.18]];

function bone(name, x, y, z, parent) { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); return b; }

// Bake a part into bind space with skin weights. blend(y) → weight given to the parent bone at local height y.
function part(geo, boneObj, parentBone, blend, matIndex, boneIndex) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv1');
  const pos = g.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const bi = boneIndex.get(boneObj), pi = parentBone ? boneIndex.get(parentBone) : bi;
  for (let i = 0; i < n; i++) {
    const w = blend ? blend(pos.getY(i)) : 0;
    si[i * 4] = bi; si[i * 4 + 1] = pi; sw[i * 4] = 1 - w; sw[i * 4 + 1] = w;
  }
  g.applyMatrix4(boneObj.matrixWorld);
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  g.userData.mat = matIndex;
  return g;
}

// ------------------------------------------------------------------ skinned body
// mats: { pants, boots, torso, sleeve, fore, skin }
export function buildBody(build, mats) {
  const S = SHAPES[build] ?? SHAPES.male;
  const rig = new THREE.Group();
  const hips = bone('hips', 0, 0.94, 0); rig.add(hips);
  const spine = bone('spine', 0, 0.08, 0, hips);
  const head = bone('head', 0, 0.68, 0.005, spine);
  const legs = [], arms = [];
  for (const sx of [-1, 1]) {
    const thigh = bone('thigh', sx * 0.095, -0.02, 0, hips), knee = bone('knee', 0, -0.44, 0, thigh);
    legs.push({ thigh, knee });
    const sh = bone('shoulder', sx * S.sh, 0.49, 0, spine), el = bone('elbow', 0, -0.3, 0, sh), hand = bone('hand', 0, -0.3, 0.004, el);
    arms.push({ sh, el, hand });
  }
  rig.updateMatrixWorld(true);
  const bones = [hips, spine, head, ...legs.flatMap(l => [l.thigh, l.knee]), ...arms.flatMap(a => [a.sh, a.el, a.hand])];
  const idx = new Map(bones.map((b, i) => [b, i]));
  const M = ['pants', 'boots', 'torso', 'sleeve', 'fore', 'skin'];
  const mi = (k) => M.indexOf(k);
  const parts = [];
  // pelvis
  { const g = G_('pelvis' + build, () => { const s = new THREE.SphereGeometry(1, 20, 12); s.scale(S.hips[0], S.hips[1], S.hips[2]); s.translate(0, -0.03, 0); return s; }); parts.push(part(g, hips, null, null, mi('pants'), idx)); }
  for (const { thigh, knee } of legs) {
    parts.push(part(G_('thigh' + build, () => lathe(S.thigh)), thigh, hips, (y) => sstep(-0.1, 0.04, y) * 0.55, mi('pants'), idx));
    parts.push(part(G_('shin' + build, () => lathe(S.shin)), knee, thigh, (y) => sstep(-0.06, 0.03, y) * 0.5, mi('pants'), idx));
    parts.push(part(G_('boot', () => lathe(BOOT)), knee, null, null, mi('boots'), idx));
    parts.push(part(G_('foot', () => { const s = new THREE.SphereGeometry(0.068, 14, 10); s.scale(1, 0.62, 1.95); s.translate(0, -0.44, 0.065); return s; }), knee, null, null, mi('boots'), idx));
  }
  parts.push(part(G_('torso' + build, () => lathe(S.torso, 26, S.tz)), spine, hips, (y) => sstep(0.12, -0.08, y), mi('torso'), idx));
  parts.push(part(G_('neck' + build, () => lathe([[0.052, 0.58], [0.05, 0.64], [0.047, 0.7], [0.046, 0.74]], 16)), spine, head, (y) => sstep(0.64, 0.73, y) * 0.6, mi('skin'), idx));
  for (const { sh, el } of arms) {
    parts.push(part(G_('delt' + build, () => { const s = new THREE.SphereGeometry(S.upper[4][0] * 1.08, 16, 12); s.scale(1, 1.05, 1.1); return s; }), sh, spine, (y) => sstep(-0.05, 0.06, y) * 0.5, mi('sleeve'), idx));
    parts.push(part(G_('upper' + build, () => lathe(S.upper)), sh, spine, (y) => sstep(-0.06, 0.03, y) * 0.45, mi('sleeve'), idx));
    parts.push(part(G_('fore' + build, () => lathe(S.fore)), el, sh, (y) => sstep(-0.06, 0.02, y) * 0.5, mi('fore'), idx));
  }
  const geos = parts;
  const merged = mergeGeometries(geos, true);
  merged.groups.forEach((g, i) => { g.materialIndex = geos[i].userData.mat; });
  merged.computeBoundingSphere(); merged.boundingSphere.radius = 1.6;
  const mesh = new THREE.SkinnedMesh(merged, M.map(k => mats[k]));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  rig.add(mesh);
  mesh.bind(new THREE.Skeleton(bones));
  return { rig, mesh, hips, spine, head, legs, arms, tz: S.tz };
}

// ------------------------------------------------------------------ hands with fingers (rigid, attached to the hand bone)
export function buildHand(mat, sx, female) {
  const k = female ? 0.88 : 1, g = new THREE.Group();
  const palm = new THREE.Mesh(G_('palm', () => { const s = new THREE.SphereGeometry(1, 12, 10); s.scale(0.038, 0.048, 0.019); return s; }), mat); palm.position.y = -0.03; g.add(palm);
  const seg = G_('fseg', () => new THREE.CapsuleGeometry(0.0085, 0.022, 3, 8));
  for (let f = 0; f < 4; f++) {
    const base = new THREE.Group(); base.position.set((f - 1.5) * 0.017 * sx, -0.075, 0.004); base.rotation.x = -0.9; g.add(base); // curled into a loose grip
    const p1 = new THREE.Mesh(seg, mat); p1.position.y = -0.016; base.add(p1);
    const j = new THREE.Group(); j.position.y = -0.033; j.rotation.x = -1.0; base.add(j);
    const p2 = new THREE.Mesh(seg, mat); p2.position.y = -0.014; p2.scale.setScalar(0.88); j.add(p2);
  }
  const th = new THREE.Group(); th.position.set(-sx * 0.03, -0.03, 0.014); th.rotation.set(-0.6, 0, -sx * 0.7); g.add(th);
  const t1 = new THREE.Mesh(seg, mat); t1.position.y = -0.018; t1.scale.setScalar(1.1); th.add(t1);
  g.scale.setScalar(k);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ------------------------------------------------------------------ sculpted head
const HR = 0.112, HS = [0.86, 1.1, 1.0];
// radial displacement (fraction of radius) for a direction on the head
function sculpt(nx, ny, nz, o) {
  const f = (cx, cy, sxx, syy) => Math.exp(-((nx - cx) ** 2 / (sxx * sxx) + (ny - cy) ** 2 / (syy * syy)));
  const front = sstep(0.0, 0.45, nz);
  const fem = o.female ? 0.7 : 1, und = o.undead ? 1 : 0;
  let d = 0;
  // brow ridge and forehead
  d += 0.045 * fem * f(0, FACE.brow, 0.55, 0.06) * front;
  // eye sockets
  for (const s of [-1, 1]) d -= (0.085 + 0.06 * und) * f(s * FACE.eye[0], FACE.eye[1], 0.15, 0.1) * front;
  // cheekbones (hollow cheeks when undead)
  for (const s of [-1, 1]) { d += 0.05 * f(s * 0.52, -0.06, 0.18, 0.12) * front; d -= (0.02 + 0.07 * und) * f(s * 0.42, -0.42, 0.16, 0.16) * front; }
  // nose: bridge, tip, nostril wings
  if (!und) {
    d += 0.06 * f(0, 0.05, 0.06, 0.12) * front;
    d += (o.female ? 0.2 : 0.26) * f(0, -0.17, 0.065, 0.1) * front;
    for (const s of [-1, 1]) d += 0.09 * f(s * 0.1, -0.24, 0.06, 0.05) * front;
  } else d -= 0.05 * f(0, -0.2, 0.08, 0.08) * front;
  // lips and mouth
  d += 0.065 * f(0, -0.43, 0.2, 0.045) * front; d += 0.055 * f(0, -0.52, 0.18, 0.045) * front; d -= 0.02 * f(0, -0.475, 0.22, 0.012) * front;
  // chin and jaw
  d += (o.female ? 0.05 : 0.08) * f(0, -0.78, 0.18, 0.1) * front;
  return d;
}
function sculptHead(o) {
  return G_('head' + !!o.female + !!o.undead, () => {
    const g = new THREE.SphereGeometry(HR, 72, 54), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      let r = HR * (1 + sculpt(v.x, v.y, v.z, o));
      let x = v.x * r, y = v.y * r, z = v.z * r;
      // jaw tapers toward the chin; skull is fuller at the back
      if (y < 0) { const k = -y / HR; x *= 1 - (o.female ? 0.3 : 0.24) * k * k; z *= 1 - 0.06 * k; }
      if (z < 0) z *= 1.08;
      p.setXYZ(i, x * HS[0], y * HS[1], z * HS[2]);
    }
    g.computeVertexNormals();
    return g;
  });
}
const surfPoint = (nx, ny, o) => {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  let r = HR * (1 + sculpt(nx, ny, nz, o)), x = nx * r, y = ny * r, z = nz * r;
  if (y < 0) { const k = -y / HR; x *= 1 - (o.female ? 0.3 : 0.24) * k * k; z *= 1 - 0.06 * k; }
  return new THREE.Vector3(x * HS[0], y * HS[1], z * HS[2]);
};

// strand cards are lit as if they were the surface of the hair volume (normals point away from the head centre)
function radialNormals(g) {
  const p = g.attributes.position, n = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).setY(p.getY(i) - 0.01).normalize(); n[i * 3] = v.x; n[i * 3 + 1] = v.y * 0.7 + 0.3; n[i * 3 + 2] = v.z; }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.normalizeNormals();
}
// hair as strand cards: ribbons that follow the scalp and fall with gravity
function hairCards(style, female, seed = 1) {
  return G_('cards' + style + female, () => {
    let s = seed * 9301; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const pos = [], uv = [], idx = [];
    const scalp = (dir, lift) => new THREE.Vector3(dir.x * HR * HS[0] * lift, dir.y * HR * HS[1] * lift, dir.z * HR * HS[2] * lift);
    const long = style === 'long', count = long ? 150 : style === 'short' ? 120 : 110;
    for (let c = 0; c < count; c++) {
      // root on the scalp above the hairline (higher at the forehead)
      let dir;
      for (let t = 0; t < 30; t++) {
        dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 1.2 - 0.2, rnd() * 2 - 1).normalize();
        const hairline = dir.z > 0 ? 0.5 + dir.z * 0.2 : -0.1 + (long ? -0.25 : 0);
        if (dir.y > hairline - Math.abs(dir.x) * (dir.z > 0 ? 0.3 : 0)) break;
      }
      const len = long ? 0.18 + rnd() * 0.22 : style === 'short' ? 0.05 + rnd() * 0.05 : 0.06 + rnd() * 0.06;
      const w = 0.035 + rnd() * 0.025, SEGS = long ? 7 : 4;
      let p = scalp(dir, 1.02 + rnd() * 0.04);
      const pts = [p.clone()];
      // initial flow: away from the crown parting, then gravity
      let flow = new THREE.Vector3(dir.x * 0.55, long ? -0.3 : 0.1, -1).normalize();   // combed back from the hairline, then down
      for (let k = 1; k <= SEGS; k++) {
        const n = p.clone().normalize();
        flow.addScaledVector(new THREE.Vector3(0, -1, 0), 0.35).normalize();
        flow.addScaledVector(n, -flow.dot(n) * 0.85).normalize();       // hug the scalp
        p = p.clone().addScaledVector(flow, len / SEGS);
        const r = new THREE.Vector3(p.x / (HR * HS[0]), p.y / (HR * HS[1]), p.z / (HR * HS[2])).length();
        if (r < 1.03 && p.y > -0.06) p.multiplyScalar(1.03 / r);           // stay outside the skull
        // keep hair out of the face: nothing may hang in front of the ears below the brow
        if (p.y < 0.06 && p.z > -0.02 && Math.abs(p.x) < HR * HS[0] * 1.05) p.z = -0.02 - (0.06 - p.y) * 0.2;
        pts.push(p.clone());
      }
      const base = pos.length / 3;
      pts.forEach((q, k) => {
        const n = q.clone().normalize(), t = (pts[Math.min(k + 1, pts.length - 1)]).clone().sub(pts[Math.max(k - 1, 0)]).normalize();
        const side = new THREE.Vector3().crossVectors(t, n).normalize().multiplyScalar(w * (1 - k / pts.length * 0.5) / 2);
        pos.push(q.x - side.x, q.y - side.y, q.z - side.z, q.x + side.x, q.y + side.y, q.z + side.z);
        const u0 = (c % 4) * 0.25; uv.push(u0, 1 - k / SEGS, u0 + 0.25, 1 - k / SEGS);
        if (k < pts.length - 1) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); radialNormals(g);
    return g;
  });
}
function beardCards(style, o) {
  return G_('beard' + style + !!o.female, () => {
    let s = 4242; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const pos = [], uv = [], idx = [];
    const long = style === 'long' || style === 'braided', count = long ? 110 : 80;
    for (let c = 0; c < count; c++) {
      let nx, ny;
      for (let t = 0; t < 40; t++) { nx = rnd() * 1.6 - 0.8; ny = -0.25 - rnd() * 0.7; if (nx * nx + ny * ny < 0.92 && !(Math.abs(nx) < 0.2 && ny > -0.56 && ny < -0.36)) break; }
      const root = surfPoint(nx, ny, o).multiplyScalar(1.01);
      const len = long ? 0.045 + rnd() * 0.055 : 0.02 + rnd() * 0.02, w = 0.018 + rnd() * 0.012;
      const flow = new THREE.Vector3(nx * 0.15, -1, 0.12).normalize();
      const pts = [root, root.clone().addScaledVector(flow, len * 0.5).addScaledVector(root.clone().normalize(), 0.004), root.clone().addScaledVector(flow, len)];
      const base = pos.length / 3;
      pts.forEach((q, k) => {
        const side = new THREE.Vector3().crossVectors(flow, q.clone().normalize()).normalize().multiplyScalar(w / 2);
        pos.push(q.x - side.x, q.y - side.y, q.z - side.z, q.x + side.x, q.y + side.y, q.z + side.z);
        const u0 = (c % 4) * 0.25; uv.push(u0, 1 - k / 2 * 0.6, u0 + 0.25, 1 - k / 2 * 0.6);
        if (k < 2) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); radialNormals(g);
    return g;
  });
}

// o: { skin, female, undead, hair, hairStyle, beard, beardStyle, face:{...}, helmet (bool), hood (bool) }
export function buildHead(o) {
  const g = new THREE.Group();
  const face = o.face ?? {};
  const fo = { skin: o.skin, female: o.female, undead: o.undead, hair: o.hairStyle === 'bald' ? undefined : o.hair, beard: o.beard, bald: o.hairStyle === 'bald', ...face };
  const skinM = skinFaceMaterial(fo);
  const head = new THREE.Mesh(sculptHead(o), skinM); head.position.y = 0.105; head.castShadow = true; head.receiveShadow = true; g.add(head);
  const H = new THREE.Group(); H.position.y = 0.105; g.add(H);
  // ears
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(G_('ear', () => { const s = new THREE.SphereGeometry(1, 12, 10); s.scale(0.011, 0.03, 0.019); return s; }), skinM);
    ear.position.set(sx * HR * HS[0] * 0.98, 0.0, -0.008); ear.rotation.y = sx * 0.35; ear.castShadow = true; H.add(ear);
  }
  // eyes with lids
  const lids = [];
  for (const sx of [-1, 1]) {
    const sp = surfPoint(sx * FACE.eye[0], FACE.eye[1], o);
    const c = sp.clone().setZ(sp.z - 0.0065);
    const eyeR = 0.0112;
    if (o.undead) {
      const glow = new THREE.Mesh(G_('glow', () => new THREE.SphereGeometry(0.006, 10, 8)), new THREE.MeshBasicMaterial({ color: new THREE.Color(face.eyeGlow ?? 0x66ccff).multiplyScalar(3.5) }));
      glow.position.copy(c).setZ(c.z + 0.006); H.add(glow); continue;
    }
    const eye = new THREE.Mesh(G_('eyeball', () => new THREE.SphereGeometry(eyeR, 20, 14)), eyeMaterial(face.eyeCol ?? 0x5a7a9a));
    eye.position.copy(c); H.add(eye);
    const lid = new THREE.Group(); lid.position.copy(c); H.add(lid);
    const up = new THREE.Mesh(G_('lidU', () => new THREE.SphereGeometry(eyeR * 1.12, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), skinM); up.rotation.x = 0.12; lid.add(up);
    const lo = new THREE.Mesh(G_('lidL', () => new THREE.SphereGeometry(eyeR * 1.1, 20, 6, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22)), skinM); lo.rotation.x = -0.3; H.add(lo); lo.position.copy(c);
    lids.push(up);
  }
  // hair
  if (o.hair !== undefined && o.hairStyle !== 'bald' && !o.helmet && !o.hood) {
    const cap = new THREE.Mesh(G_('scalp', () => { const s = new THREE.SphereGeometry(HR * 1.015, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5); s.scale(HS[0], HS[1], HS[2]); s.rotateX(-0.42); return s; }), hairMaterial(o.hair));
    cap.position.set(0, 0.006, -0.008); H.add(cap);
    const style = o.hairStyle ?? 'short';
    const cardStyle = style === 'long' ? 'long' : style === 'short' ? 'short' : 'mid';
    const cards = new THREE.Mesh(hairCards(cardStyle, !!o.female), hairCardMaterial(o.hair)); H.add(cards);
    const hm = hairMaterial(o.hair);
    if (style === 'bun') { const b = new THREE.Mesh(G_('bun', () => new THREE.SphereGeometry(0.045, 16, 12)), hm); b.position.set(0, 0.075, -0.1); b.scale.set(1, 0.85, 0.9); H.add(b); }
    if (style === 'braid') for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(G_('braid', () => new THREE.SphereGeometry(0.022, 12, 8)), hm); b.position.set(0, -0.02 - i * 0.04, -0.115 - Math.min(i, 3) * 0.006); b.scale.set(1, 1.3, 0.9); b.rotation.z = (i % 2 ? 0.4 : -0.4); H.add(b); }
    if (style === 'ponytail') { const t = new THREE.Mesh(G_('pony', () => new THREE.CapsuleGeometry(0.026, 0.16, 4, 10)), hm); t.position.set(0, -0.03, -0.13); t.rotation.x = 0.3; H.add(t); }
  }
  // beard
  if (o.beard !== undefined) {
    const bc = new THREE.Mesh(beardCards(o.beardStyle ?? 'full', o), hairCardMaterial(o.beard)); H.add(bc);
    if (o.beardStyle === 'braided' || o.beardStyle === 'long') {
      const hm = hairMaterial(o.beard);
      for (let i = 0; i < (o.beardStyle === 'long' ? 3 : 4); i++) { const b = new THREE.Mesh(G_('bbraid', () => new THREE.SphereGeometry(0.018, 10, 8)), hm); b.position.set(0, -0.11 - i * 0.03, 0.09 - i * 0.006); b.scale.set(1.2 - i * 0.1, 1.3, 1); H.add(b); }
    }
  }
  g.traverse(m => { if (m.isMesh && !m.material.alphaTest) m.castShadow = true; });
  g.userData.lids = lids;
  return g;
}
export const HEAD_SCALE = { r: HR, s: HS };
