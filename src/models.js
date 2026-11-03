import * as THREE from 'three';
import { triMat, uvMat } from './textures.js';
import { faceMaterial, outfitMaterial, pantsMaterial, bootMaterial, skinMaterial, hairMaterial, furMaterial, helmMaterial, shieldMaterial,
  scaleMaterial, bellyMaterial, wingMaterial, hornMaterial, bladeMaterial } from './charTex.js';

// ------------------------------------------------------------------ generic materials (scenery, fx)
const matCache = new Map();
export function mat(color, opts = {}) {
  if (opts.m) return triMat(opts.m, color, { emissive: opts.emissive, scale: opts.scale, side: opts.side });
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const m = opts.basic
      // glowing things (fire, runes, magic) are pushed into HDR so only they catch the bloom
      ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(opts.glow ?? 3.2), transparent: !!opts.transparent, opacity: opts.opacity ?? 1, depthWrite: opts.depthWrite ?? true })
      : new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0, emissive: opts.emissive ?? 0x000000,
          emissiveIntensity: opts.ei ?? 1, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide });
    matCache.set(key, m);
  }
  return matCache.get(key);
}
export function box(w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ geometry helpers
const geoCache = new Map();
const G_ = (key, fn) => { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); };
// lathe from [radius, y] points listed bottom → top (UV v=0 at the bottom, front of the body at u=0.5)
const lathe = (key, pts, seg = 18, zScale = 1) => G_(key, () => {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, Math.PI, Math.PI * 2);
  if (zScale !== 1) g.scale(1, 1, zScale);
  g.computeVertexNormals(); return g;
});
const sphere = (r, w = 16, h = 12) => G_(`s${r}_${w}`, () => new THREE.SphereGeometry(r, w, h));
const capsule = (r, l) => G_(`c${r}_${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 12));
function mesh(geo, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function pivot(x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); return g; }
const metalM = (c) => uvMat('metal', c, { roughness: 0.32, metalness: 0.9, bump: 0.3 });

// head: sphere with a narrower jaw and fuller skull; face texture centred at u=0.25 (+Z)
const HEAD_R = 0.118;
const headGeo = () => G_('head', () => {
  const g = new THREE.SphereGeometry(HEAD_R, 32, 24), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) { const k = -y / HEAD_R; x *= 1 - 0.24 * k; z *= 1 - 0.08 * k; if (z > 0) z += 0.012 * k * (z / HEAD_R); }
    if (z < 0) z *= 1.07;
    p.setXYZ(i, x * 0.94, y * 1.14, z);
  }
  g.computeVertexNormals(); return g;
});

// ------------------------------------------------------------------ humanoid
// Skeleton: g (yaw) → rig (death/lunge) → hips → legs (thigh → knee) ; hips → spine → arms (shoulder → elbow), head
const BODY = {
  male: { torso: [[0.19, -0.1], [0.19, 0.0], [0.178, 0.1], [0.19, 0.24], [0.214, 0.37], [0.226, 0.46], [0.214, 0.53], [0.16, 0.6], [0.075, 0.645], [0.052, 0.67]], z: 0.7, sh: 0.255 },
  female: { torso: [[0.2, -0.1], [0.19, 0.0], [0.152, 0.12], [0.168, 0.24], [0.2, 0.34], [0.196, 0.42], [0.186, 0.5], [0.145, 0.58], [0.07, 0.635], [0.048, 0.66]], z: 0.74, sh: 0.225 },
};
const THIGH = [[0.082, -0.44], [0.092, -0.38], [0.106, -0.24], [0.12, -0.08], [0.116, 0.03]];
const SHIN = [[0.06, -0.42], [0.066, -0.36], [0.082, -0.2], [0.088, -0.09], [0.08, 0.02]];
const BOOT = [[0.0, -0.475], [0.07, -0.475], [0.083, -0.44], [0.08, -0.32], [0.088, -0.2], [0.092, -0.18]];
const UPPER = [[0.056, -0.32], [0.06, -0.28], [0.07, -0.16], [0.08, -0.04], [0.086, 0.02]];
const FORE = [[0.04, -0.29], [0.046, -0.24], [0.058, -0.1], [0.062, -0.03], [0.056, 0.02]];
const SKIRT = { tunic: [[0.29, -0.36], [0.255, -0.22], [0.228, -0.08], [0.21, 0.04], [0.2, 0.1]], robe: [[0.36, -0.86], [0.31, -0.55], [0.26, -0.25], [0.218, -0.02], [0.2, 0.1]] };

export function humanoid(o = {}) {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const s = o.scale ?? 1, B = BODY[o.build ?? 'male'];
  rig.scale.setScalar(s);
  const undead = !!o.undead;
  const outfit = o.outfit ?? { type: 'tunic', base: 0x6b5a45 };
  const torsoM = outfitMaterial(outfit, 'torso'), sleeveM = outfitMaterial(outfit, 'sleeve'), skirtM = outfitMaterial(outfit, 'skirt');
  const skin = skinMaterial(o.skin ?? 0xd9a882, undead), pants = pantsMaterial(o.pants ?? { base: 0x4a3b2a }), boots = bootMaterial(o.boots ?? 0x3a2a1c);

  const hips = pivot(0, 0.94, 0); rig.add(hips);
  { const hm = mesh(sphere(0.19), pants, 0, -0.02, 0); hm.scale.set(1.05, 0.6, 0.75); hips.add(hm); }
  // legs with knees
  const legs = [];
  for (const sx of [-1, 1]) {
    const thigh = pivot(sx * 0.1, -0.02, 0); hips.add(thigh);
    thigh.add(mesh(lathe('thigh', THIGH), pants));
    const knee = pivot(0, -0.44, 0); thigh.add(knee);
    knee.add(mesh(lathe('shin', SHIN), pants));
    knee.add(mesh(lathe('boot', BOOT), boots));
    const foot = mesh(sphere(0.07), boots, 0, -0.44, 0.06); foot.scale.set(1.05, 0.62, 1.9); knee.add(foot);
    legs.push({ thigh, knee });
  }
  // skirt / tunic hem (static on the hips) and belt
  const skirtType = o.skirt === undefined ? 'tunic' : o.skirt;
  if (skirtType) { const sk = mesh(lathe('skirt' + skirtType, SKIRT[skirtType], 22, B.z + 0.05), skirtM, 0, 0.0, 0); hips.add(sk); }
  const belt = mesh(G_('belt', () => new THREE.TorusGeometry(0.2, 0.026, 6, 24)), bootMaterial(o.belt ?? 0x2b2018), 0, 0.07, 0); belt.rotation.x = Math.PI / 2; belt.scale.set(1, B.z + 0.06, 1); hips.add(belt);
  hips.add(mesh(G_('buckle', () => new THREE.BoxGeometry(0.055, 0.045, 0.02)), metalM(0xb09040), 0, 0.07, 0.15));
  const pouch = mesh(G_('pouch', () => new THREE.BoxGeometry(0.08, 0.09, 0.05)), bootMaterial(0x5a3a22), 0.16, 0.0, 0.08); pouch.rotation.y = 0.5; hips.add(pouch);

  // spine (everything above the waist)
  const spine = pivot(0, 0.08, 0); hips.add(spine);
  spine.add(mesh(lathe('torso' + (o.build ?? 'male'), B.torso, 22, B.z), torsoM));
  const neck = mesh(lathe('neck', [[0.05, 0.6], [0.048, 0.7], [0.046, 0.74]]), skin); spine.add(neck);
  // arms with elbows
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = pivot(sx * B.sh, 0.5, 0); spine.add(sh);
    sh.add(mesh(sphere(0.078), sleeveM, 0, 0, 0));
    sh.add(mesh(lathe('upper', UPPER), sleeveM));
    const el = pivot(0, -0.31, 0); sh.add(el);
    el.add(mesh(lathe('fore', FORE), o.bareArms ? skin : sleeveM));
    const hand = pivot(0, -0.33, 0.005); el.add(hand);
    const handM = o.gloves !== undefined ? bootMaterial(o.gloves) : skin;
    const palm = mesh(sphere(0.045), handM); palm.scale.set(0.85, 1.25, 0.65); hand.add(palm);
    const thumb = mesh(capsule(0.016, 0.04), handM, -sx * 0.035, 0.01, 0.02); thumb.rotation.z = sx * 0.6; hand.add(thumb);
    if (o.pauldrons) {
      const pm = o.pauldrons === 'fur' ? furMaterial(o.mantle ?? 0x6a5a48, o.mantle ?? 0x6a5a48) : o.pauldrons === 'metal' ? helmMaterial(o.helmet?.col ?? 0x8a8a8a, { rust: o.helmet?.rust }) : bootMaterial(0x4a3020);
      const pd = mesh(G_('pauld', () => new THREE.SphereGeometry(0.105, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), pm, 0, 0.02, 0); pd.scale.set(1.1, 0.9, 1.15); sh.add(pd);
    }
    arms.push({ sh, el, hand });
  }
  // head
  const head = pivot(0, 0.72, 0.005); spine.add(head);
  const face = o.face ?? {};
  const faceM = faceMaterial({ skin: o.skin ?? 0xd9a882, hair: o.hairStyle === 'bald' ? undefined : o.hair, undead, ...face });
  const skull = mesh(headGeo(), faceM, 0, 0.11, 0); head.add(skull);
  const nose = mesh(G_('nose', () => { const c = new THREE.ConeGeometry(0.017, 0.055, 8); c.rotateX(Math.PI / 2); c.scale(1, 1.3, 1); return c; }), skin, 0, 0.1, 0.122); head.add(nose);
  if (undead) nose.visible = false;
  for (const sx of [-1, 1]) { const ear = mesh(sphere(0.02, 8, 6), skin, sx * 0.108, 0.11, -0.005); ear.scale.set(0.6, 1.6, 1.1); head.add(ear); }
  const hairM = o.hair !== undefined ? hairMaterial(o.hair) : null;
  const hs = o.hairStyle ?? 'short';
  if (hairM && hs !== 'bald' && !o.helmet && !o.hood) {
    const cap = mesh(G_('hcap', () => new THREE.SphereGeometry(HEAD_R * 1.08, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5)), hairM, 0, 0.14, -0.012); cap.scale.set(0.97, 1.08, 1.05); cap.rotation.x = -0.45; head.add(cap);
    const back = mesh(sphere(HEAD_R * 1.02), hairM, 0, 0.105, -0.038); back.scale.set(0.96, 1.05, 0.82); head.add(back);
    if (hs === 'long') { const l = mesh(capsule(0.085, 0.22), hairM, 0, -0.04, -0.07); l.scale.set(1.35, 1, 0.5); head.add(l); }
    if (hs === 'bun') head.add(mesh(sphere(0.055), hairM, 0, 0.2, -0.09));
    if (hs === 'braid') for (let i = 0; i < 7; i++) head.add(mesh(sphere(0.032 - i * 0.002), hairM, 0, 0.04 - i * 0.055, -0.115 - i * 0.01));
    if (hs === 'ponytail') { const pt = mesh(capsule(0.035, 0.2), hairM, 0, 0.0, -0.13); pt.rotation.x = 0.35; head.add(pt); }
  }
  if (o.beard !== undefined) {
    const bm = hairMaterial(o.beard);
    // beard hugs the jaw (open at the top so the face stays visible)
    const b = mesh(G_('beard', () => new THREE.SphereGeometry(0.104, 18, 10, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.6, Math.PI * 0.4)), bm, 0, 0.1, 0.012);
    b.material = bm; b.scale.set(0.93, 1.1 + (o.beardStyle === 'long' ? 0.7 : 0), 1.12); head.add(b);
    const mus = mesh(capsule(0.011, 0.045), bm, 0, 0.072, 0.118); mus.rotation.z = Math.PI / 2; head.add(mus);
    if (o.beardStyle === 'braided') for (let i = 0; i < 4; i++) head.add(mesh(sphere(0.022), bm, 0, -0.05 - i * 0.04, 0.09 - i * 0.005));
  }
  if (o.hood !== undefined) {
    const hm = outfitMaterial({ type: 'tunic', base: o.hood }, 'plain');
    const hood = mesh(G_('hood', () => new THREE.SphereGeometry(HEAD_R * 1.35, 24, 14, Math.PI * 0.5 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.72)), hm, 0, 0.11, -0.01);
    hood.material = hm.clone(); hood.material.side = THREE.DoubleSide; hood.scale.set(1, 1.12, 1.05); head.add(hood);
    const cowl = mesh(G_('cowl', () => new THREE.TorusGeometry(0.1, 0.045, 8, 18)), hm, 0, -0.02, 0); cowl.rotation.x = Math.PI / 2; head.add(cowl);
  }
  if (o.helmet) {
    const hm = helmMaterial(o.helmet.col ?? 0x8a8a8a, { rust: o.helmet.rust, band: o.helmet.band });
    const helm = new THREE.Group(); helm.position.set(0, 0.13, -0.005); helm.rotation.x = -0.3; head.add(helm);
    const h = mesh(G_('helm', () => new THREE.SphereGeometry(HEAD_R * 1.16, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5)), hm); h.scale.set(0.98, 1.15, 1.05); helm.add(h);
    const rim = mesh(G_('helmrim', () => new THREE.TorusGeometry(HEAD_R * 1.14, 0.012, 6, 28)), hm, 0, 0.004, 0); rim.rotation.x = Math.PI / 2; rim.scale.set(0.98, 1.05, 1); helm.add(rim);
    const nasal = mesh(G_('nasal', () => new THREE.BoxGeometry(0.018, 0.075, 0.016)), hm, 0, -0.02, 0.136); nasal.rotation.x = 0.3; helm.add(nasal);
    if (o.helmet.horns) for (const sx of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx * 0.12, 0.02, 0), new THREE.Vector3(sx * 0.14, 0.17, -0.02));
      const hg = G_('horn' + sx, () => { const t = new THREE.TubeGeometry(curve, 10, 0.026, 8); const p = t.attributes.position;
        // taper the tube toward the tip
        for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const k = Math.floor(i / 9) / 10; const c = curve.getPoint(k); v.sub(c).multiplyScalar(1 - k * 0.85).add(c); p.setXYZ(i, v.x, v.y, v.z); }
        t.computeVertexNormals(); return t; });
      head.add(mesh(hg, hornMaterial(), sx * 0.11, 0.16, 0));
    }
  }
  if (o.mantle !== undefined) {
    const fm = furMaterial(o.mantle, o.mantle);
    const mt = mesh(G_('mantle', () => new THREE.TorusGeometry(0.17, 0.085, 10, 24)), fm, 0, 0.58, -0.01); mt.rotation.x = Math.PI / 2; mt.scale.set(1.15, B.z + 0.2, 1); spine.add(mt);
  }
  if (o.cape !== undefined) {
    const cm = outfitMaterial({ type: 'tunic', base: o.cape, trim: o.capeTrim ?? o.cape }, 'skirt');
    const c = mesh(G_('cape', () => { const p = new THREE.PlaneGeometry(0.5, 1.05, 8, 10); const pa = p.attributes.position;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), t = 0.5 - y; pa.setX(i, x * (1 + t * 0.5)); pa.setZ(i, -Math.sin(x * 22) * 0.025 * t - t * 0.12); }
      p.computeVertexNormals(); return p; }), cm, 0, 0.1, -0.17);
    c.material = cm.clone(); c.material.side = THREE.DoubleSide; spine.add(c);
  }
  if (o.weapon) { const w = weaponMesh(o.weapon); w.rotation.x = Math.PI / 2; arms[1].hand.add(w); }
  if (o.shield) {
    const sm = shieldMaterial(o.shield), rimM = metalM(0x6a6a6a);
    const sh = new THREE.Group();
    sh.add(mesh(G_('shield', () => new THREE.CylinderGeometry(0.3, 0.3, 0.035, 28)), [rimM, sm, sm]));
    sh.add(mesh(G_('boss', () => new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), metalM(0x8a8a8a), 0, 0.018, 0));
    const rr = mesh(G_('srim', () => new THREE.TorusGeometry(0.3, 0.016, 6, 32)), rimM); rr.rotation.x = Math.PI / 2; sh.add(rr);
    sh.rotation.z = Math.PI / 2; sh.position.set(-0.06, -0.12, 0.05); arms[0].el.add(sh);
  }
  g.userData.parts = { rig, hips, spine, head, legL: legs[0].thigh, legR: legs[1].thigh, kneeL: legs[0].knee, kneeR: legs[1].knee,
    armL: arms[0].sh, armR: arms[1].sh, elbowL: arms[0].el, elbowR: arms[1].el };
  return g;
}

export function weaponMesh(kind) {
  const g = new THREE.Group();
  const leather = bootMaterial(0x3a2a1a);
  if (kind === 'bow') {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.6, 0), new THREE.Vector3(0, 0, 0.22), new THREE.Vector3(0, 0.6, 0));
    g.add(mesh(G_('bow', () => new THREE.TubeGeometry(curve, 16, 0.018, 6)), bootMaterial(0x6a4422)));
    g.add(new THREE.Mesh(G_('bstr', () => new THREE.CylinderGeometry(0.003, 0.003, 1.2, 3)), mat(0xddd8c8)));
    g.add(mesh(G_('bgrip', () => new THREE.CylinderGeometry(0.026, 0.026, 0.12, 8)), leather, 0, 0, 0.21));
    g.rotation.x = Math.PI / 2;
    return g;
  }
  g.add(mesh(G_('grip', () => new THREE.CylinderGeometry(0.022, 0.025, 0.24, 8)), leather));
  g.add(mesh(sphere(0.03, 8, 6), metalM(0x8a7040), 0, -0.13, 0));
  if (kind === 'axe' || kind === 'hammer') {
    g.add(mesh(G_('shaft', () => new THREE.CylinderGeometry(0.024, 0.03, 0.9, 8)), triMat('planks', 0xc0a080, { scale: 3 }), 0, 0.45, 0));
    if (kind === 'hammer') g.add(mesh(G_('hamhead', () => new THREE.BoxGeometry(0.1, 0.12, 0.22)), metalM(0x5a5a5a), 0, 0.88, 0));
    else g.add(mesh(G_('axehead', () => { const s = new THREE.Shape(); s.moveTo(0, -0.1); s.quadraticCurveTo(0.3, -0.26, 0.32, 0); s.quadraticCurveTo(0.3, 0.26, 0, 0.1); s.lineTo(0, -0.1);
      const e = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 1 }); e.translate(0, 0, -0.011); e.rotateY(-Math.PI / 2); return e; }), metalM(0x8a8a8a), 0, 0.82, 0.02));
  } else {
    g.add(mesh(G_('guard', () => new THREE.BoxGeometry(0.2, 0.03, 0.045)), metalM(0x7a6a3a), 0, 0.13, 0));
    g.add(mesh(bladeGeo(), bladeMaterial(0xc0c4ca), 0, 0.14, 0));
  }
  return g;
}
export const bladeGeo = () => G_('blade', () => { const s = new THREE.Shape(); s.moveTo(-0.028, 0); s.lineTo(0.028, 0); s.lineTo(0.024, 0.7); s.lineTo(0, 0.8); s.lineTo(-0.024, 0.7); s.lineTo(-0.028, 0);
  const e = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.004, bevelSegments: 1 }); e.translate(0, 0, -0.003); e.rotateY(Math.PI / 2);
  // remap UVs along the blade so the fuller texture runs lengthwise
  const p = e.attributes.position, uv = e.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) / 0.06 + 0.5, p.getY(i) / 0.8); return e; });

// ------------------------------------------------------------------ animation
const ease = { io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), in: (t) => t * t * t, out: (t) => 1 - Math.pow(1 - t, 3) };
const lerp = (a, b, t) => a + (b - a) * t;
const cl01 = (x) => Math.max(0, Math.min(1, x));

// s: { t, phase, move (0..1), stance (bool), atk (1→0), atkKind, hitT (1→0), stun, deadT (-1 alive) }
export function animHumanoid(p, s, dt) {
  s.t = (s.t || 0) + dt;
  s.mb = lerp(s.mb || 0, s.move || 0, Math.min(1, dt * 8));
  s.sb = lerp(s.sb || 0, s.stance ? 1 : 0, Math.min(1, dt * 5));
  const m = s.mb, sb = s.sb, ph = s.phase || 0, t = s.t;
  let hipY = 0, hipZ = 0, hipX = 0, spX = 0, spY = 0, spZ = 0, hdX = 0, hdY = 0;
  let lT = 0, rT = 0, lK = 0, rK = 0, lE = -0.12, rE = -0.12;
  const lS = [0, 0, -0.07], rS = [0, 0, 0.07];
  // idle: breathing, weight shift, glancing around
  const br = Math.sin(t * 1.7 + ph);
  spX += br * 0.018 * (1 - m); lS[2] -= br * 0.015; rS[2] += br * 0.015;
  hipX += Math.sin(t * 0.6 + ph) * 0.02 * (1 - m) * (1 - sb);
  hdY += Math.sin(t * 0.37 + ph * 3) * 0.35 * (1 - m) * (1 - sb); hdX += Math.sin(t * 0.23 + ph) * 0.06;
  // locomotion (walk → run blends with speed)
  const sw = Math.sin(ph);
  lT += -sw * 0.62 * m; rT += sw * 0.62 * m;
  lK += (Math.max(0, Math.sin(ph - 1.3)) * 1.15 + 0.08) * m; rK += (Math.max(0, Math.sin(ph + Math.PI - 1.3)) * 1.15 + 0.08) * m;
  hipY += -Math.abs(Math.cos(ph)) * 0.05 * m; spX += 0.16 * m * m; spY += sw * 0.12 * m; hipX += 0; hdY -= sw * 0.08 * m;
  lS[0] += sw * 0.6 * m; rS[0] += -sw * 0.6 * m; lE += -0.55 * m; rE += -0.55 * m;
  // combat stance: knees bent, weapon raised
  lT += -0.22 * sb; rT += 0.12 * sb; lK += 0.38 * sb; rK += 0.3 * sb; hipY += -0.07 * sb; spX += 0.12 * sb; spY += 0.25 * sb;
  rS[0] += -0.7 * sb; rE += -0.85 * sb; rS[2] += 0.15 * sb; lS[0] += -0.55 * sb; lE += -1.0 * sb;
  // attack
  if (s.atk > 0) {
    const k = 1 - s.atk;
    if (s.atkKind === 'bow') {
      const draw = k < 0.5 ? ease.out(k / 0.5) : 1 - ease.out((k - 0.5) / 0.5);
      rS[0] = lerp(rS[0], -1.5, Math.min(1, k * 4)); rE = lerp(rE, -0.05, Math.min(1, k * 4)); rS[2] = 0.05;
      lS[0] = lerp(lS[0], -1.45, Math.min(1, k * 4)); lE = lerp(lE, -1.9 * draw - 0.2, Math.min(1, k * 4)); lS[1] = 0.3 * draw;
      spY += -0.45; hdY += 0.35;
    } else {
      let w, st;
      if (k < 0.45) { w = ease.out(k / 0.45); st = 0; }
      else if (k < 0.6) { const q = ease.in((k - 0.45) / 0.15); w = 1 - q; st = q; }
      else { w = 0; st = 1 - ease.io((k - 0.6) / 0.4); }
      spY += 0.6 * w - 0.55 * st; spX += -0.2 * w + 0.4 * st;
      rS[0] += -2.0 * w + 0.25 * st; rS[2] += 0.35 * w - 0.1 * st; rE += -0.7 * w + 0.7 * st;
      lS[0] += 0.35 * w - 0.25 * st; lS[2] += -0.25 * w;
      hipZ += 0.32 * st; lT += -0.5 * st; lK += 0.35 * st; rT += 0.38 * st; rK += 0.2 * st; hipY += -0.05 * st;
      hdX += -0.1 * w + 0.12 * st;
    }
  }
  if (s.hitT > 0) { const h = ease.out(s.hitT); spX -= 0.5 * h; hdX -= 0.4 * h; spZ += (s.hitSide || 1) * 0.15 * h; lS[2] -= 0.5 * h; rS[2] += 0.5 * h; hipZ -= 0.12 * h; lK += 0.3 * h; rK += 0.3 * h; }
  if (s.stun) { const j = Math.sin(t * 38) * 0.03; spX += -0.3 + j; hdX += -0.35; lS[2] -= 0.6; rS[2] += 0.6; lK += 0.5; rK += 0.5; hipY -= 0.08; }
  // death: knees buckle, then fall backwards with arms flung out
  let fall = 0;
  if (s.deadT >= 0) {
    const d = s.deadT, buck = ease.out(cl01(d / 0.3));
    lK = lerp(lK, 1.5, buck); rK = lerp(rK, 1.1, buck); lT = lerp(lT, -0.9, buck); rT = lerp(rT, -0.5, buck);
    hipY = lerp(hipY, -0.3, buck); spX = lerp(spX, 0.45, buck); hdX = lerp(hdX, 0.4, buck);
    fall = ease.in(cl01((d - 0.22) / 0.5));
    const bounce = d > 0.72 ? Math.sin(cl01((d - 0.72) / 0.25) * Math.PI) * 0.07 * (1 - cl01((d - 0.72) / 0.25)) : 0;
    p.rig.rotation.x = -fall * 1.48 + bounce;
    p.rig.position.y = -fall * 0.12;
    lS[0] = lerp(lS[0], -0.4, fall); lS[2] = lerp(lS[2], -1.2, fall); rS[0] = lerp(rS[0], -0.2, fall); rS[2] = lerp(rS[2], 1.3, fall);
    lE = lerp(lE, -0.2, fall); rE = lerp(rE, -0.4, fall); hdX = lerp(hdX, -0.6, fall); spX = lerp(spX, -0.1, fall);
    lK = lerp(lK, 0.3, fall); rK = lerp(rK, 0.6, fall); lT = lerp(lT, -0.3, fall); rT = lerp(rT, 0.1, fall);
  } else { p.rig.rotation.x = 0; p.rig.position.y = 0; }
  p.hips.position.set(hipX, 0.94 + hipY, hipZ);
  p.spine.rotation.set(spX, spY, spZ);
  p.head.rotation.set(hdX, hdY - spY * 0.6, 0);
  p.legL.rotation.x = lT; p.legR.rotation.x = rT; p.kneeL.rotation.x = lK; p.kneeR.rotation.x = rK;
  p.armL.rotation.set(lS[0], lS[1], lS[2]); p.armR.rotation.set(rS[0], rS[1], rS[2]);
  p.elbowL.rotation.x = lE; p.elbowR.rotation.x = rE;
}

// ------------------------------------------------------------------ quadrupeds
export function quadruped(kind) {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const big = kind === 'bear', s = big ? 1.55 : 1;
  const coat = big ? furMaterial(0x5a3e2a, 0x7a5a40) : furMaterial(0x85858c, 0xd8d4cc, { saddle: true });
  const legM = big ? furMaterial(0x3e2a1c, 0x5a3e2a) : furMaterial(0x6a6a72, 0xc8c4bc);
  const body = pivot(0, 0.82 * s, 0); rig.add(body);
  const torso = mesh(capsule(0.28 * s, 0.7 * s), coat); torso.rotation.x = Math.PI / 2; torso.scale.set(big ? 1.1 : 0.9, 1, big ? 1.05 : 0.95); body.add(torso);
  const chest = mesh(sphere(0.31 * s), coat, 0, 0.03 * s, 0.4 * s); chest.scale.set(big ? 1.05 : 0.92, 1.05, 1); body.add(chest);
  if (big) { const hump = mesh(sphere(0.28 * s), coat, 0, 0.12 * s, 0.1 * s); hump.scale.set(1.1, 0.9, 1.3); body.add(hump); }   // shoulder hump
  const neck = mesh(capsule(0.15 * s, 0.25 * s), coat, 0, 0.1 * s, 0.62 * s); neck.rotation.x = 1.0; body.add(neck);
  const head = pivot(0, 0.2 * s, 0.78 * s); body.add(head);
  const skull = mesh(sphere(0.17 * s), coat); skull.scale.set(1, 0.9, 1.1); head.add(skull);
  const snout = mesh(capsule(0.075 * s, (big ? 0.14 : 0.2) * s), legM, 0, -0.01 * s, 0.2 * s); snout.rotation.x = Math.PI / 2; head.add(snout);
  head.add(mesh(sphere(0.035 * s, 10, 8), mat(0x0c0a0a, { roughness: 0.25 }), 0, 0.01 * s, 0.33 * s));
  const jaw = pivot(0, -0.06 * s, 0.08 * s); head.add(jaw);
  const jm = mesh(capsule(0.05 * s, 0.17 * s), legM, 0, -0.02 * s, 0.11 * s); jm.rotation.x = Math.PI / 2; jaw.add(jm);
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { const tooth = mesh(G_('fang', () => new THREE.ConeGeometry(0.008, 0.03, 4)), hornMaterial(), sx * 0.03 * s, -0.035 * s, (0.25 - i * 0.04) * s); tooth.rotation.x = Math.PI; head.add(tooth); }
  for (const sx of [-1, 1]) {
    const ear = mesh(G_(`ear${big}`, () => new THREE.ConeGeometry(0.05 * s, (big ? 0.08 : 0.16) * s, 6)), coat, sx * 0.1 * s, 0.14 * s, -0.04 * s); ear.rotation.z = -sx * 0.3; head.add(ear);
    head.add(mesh(sphere(0.022 * s, 10, 8), mat(big ? 0x140a04 : 0xe8b030, big ? { roughness: 0.2 } : { basic: true, glow: 1.6 }), sx * 0.075 * s, 0.05 * s, 0.13 * s));
  }
  const legs = [];
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const p = pivot(x * 0.16 * s, -0.12 * s, z * 0.36 * s); body.add(p);
    const up = mesh(capsule(0.085 * s, 0.22 * s), coat, 0, -0.14 * s, 0); p.add(up);
    const low = pivot(0, -0.3 * s, 0); p.add(low);
    low.add(mesh(capsule(0.05 * s, 0.25 * s), legM, 0, -0.14 * s, 0));
    const paw = mesh(sphere(0.065 * s), legM, 0, -0.31 * s, 0.03 * s); paw.scale.set(1, 0.6, 1.3); low.add(paw);
    legs.push({ p, low });
  }
  const tail = pivot(0, 0.08 * s, -0.55 * s); body.add(tail);
  if (!big) { const tm = mesh(capsule(0.065, 0.42), coat, 0, -0.06, -0.2); tm.rotation.x = -1.0; tail.add(tm); }
  else tail.add(mesh(sphere(0.07 * s), coat, 0, 0, -0.03));
  g.userData.parts = { rig, body, legs, head, jaw, tail, quad: true, big };
  return g;
}

export function animQuad(p, s, dt) {
  s.t = (s.t || 0) + dt;
  s.mb = lerp(s.mb || 0, s.move || 0, Math.min(1, dt * 6));
  s.sb = lerp(s.sb || 0, s.stance ? 1 : 0, Math.min(1, dt * 5));
  const m = s.mb, ph = s.phase || 0, t = s.t, sb = s.sb;
  let rx = 0, ry = 0, rz = 0, py = 0, pz = 0, hx = 0, hy = 0, jaw = 0.05, tx = 0, ty = 0;
  const L = [0, 0, 0, 0], K = [0, 0, 0, 0];
  // gait: trot at low speed, bounding gallop at high speed
  const gal = cl01((m - 0.5) * 2);
  const fp = ph, bp = ph + Math.PI * (1 - gal * 0.55);
  L[0] = Math.sin(fp) * 0.7 * m; L[1] = Math.sin(fp + Math.PI * (1 - gal * 0.9)) * 0.7 * m;
  L[2] = Math.sin(bp) * 0.7 * m; L[3] = Math.sin(bp + Math.PI * (1 - gal * 0.9)) * 0.7 * m;
  for (let i = 0; i < 4; i++) K[i] = Math.max(0, Math.cos(i < 2 ? fp + i * Math.PI : bp + i * Math.PI)) * 0.6 * m * (i < 2 ? -1 : 1);
  rx += Math.sin(ph * 2) * 0.06 * m * (0.5 + gal); py += Math.abs(Math.sin(ph)) * 0.07 * m * gal;
  hx += 0.1 * m + Math.sin(ph * 2) * 0.05 * m;
  // idle: breathing, sniffing, looking around; tail wag
  py += Math.sin(t * 2) * 0.008; hy += Math.sin(t * 0.45 + ph) * 0.45 * (1 - m) * (1 - sb); hx += Math.sin(t * 0.9) * 0.08 * (1 - m);
  tx = -0.3 + 0.35 * m; ty = Math.sin(t * (sb ? 3 : 6)) * (sb ? 0.15 : 0.35);
  // stalking stance: low, head down, hackles up
  py -= 0.08 * sb; hx += 0.25 * sb; tx -= 0.25 * sb; for (let i = 0; i < 4; i++) K[i] += (i < 2 ? -0.3 : 0.3) * sb;
  if (s.atk > 0) {
    const k = 1 - s.atk;
    let w, st;
    if (k < 0.4) { w = ease.out(k / 0.4); st = 0; } else if (k < 0.6) { const q = ease.in((k - 0.4) / 0.2); w = 1 - q; st = q; } else { w = 0; st = 1 - ease.io((k - 0.6) / 0.4); }
    if (p.big) { // rear up, then slam down with a swipe
      rx += -0.65 * w + 0.15 * st; py += 0.25 * w; pz += 0.4 * st; L[0] += -1.1 * w + 0.6 * st; L[1] += -0.8 * w + 0.9 * st; hx += -0.4 * w + 0.4 * st; jaw = 0.1 + 0.5 * w;
    } else { // crouch back, then lunge and bite
      pz += -0.22 * w + 0.75 * st; rx += -0.1 * w + 0.12 * st; py += -0.08 * w + 0.12 * st;
      L[2] += 0.4 * w - 0.6 * st; L[3] += 0.4 * w - 0.6 * st; L[0] += -0.2 * w - 0.7 * st; L[1] += -0.2 * w - 0.7 * st;
      hx += -0.35 * w + 0.4 * st; jaw = 0.05 + 0.6 * Math.max(w, st * (k < 0.55 ? 1 : 0));
    }
  }
  if (s.hitT > 0) { const h = ease.out(s.hitT); pz -= 0.18 * h; hx -= 0.45 * h; rz += Math.sin(t * 30) * 0.06 * h; jaw += 0.3 * h; }
  if (s.stun) { rz += Math.sin(t * 25) * 0.05; for (let i = 0; i < 4; i++) L[i] += (i % 2 ? 0.2 : -0.2); hx -= 0.2; }
  if (s.deadT >= 0) {
    const d = s.deadT, f = ease.in(cl01(d / 0.55)), b = d > 0.55 ? Math.sin(cl01((d - 0.55) / 0.2) * Math.PI) * 0.05 * (1 - cl01((d - 0.55) / 0.2)) : 0;
    rz = f * 1.5 - b; py = -0.3 * f + 0.3 * f * (p.big ? 0.4 : 0.2); hx = 0.5 * f; jaw = 0.4;
    for (let i = 0; i < 4; i++) { L[i] = lerp(L[i], (i % 2 ? 0.4 : -0.4), f); K[i] = lerp(K[i], 0.3, f); }
    tx = -0.5;
  }
  p.rig.rotation.set(rx, ry, rz); p.rig.position.set(0, py, pz);
  p.head.rotation.set(hx, hy, 0); p.jaw.rotation.x = jaw; p.tail.rotation.set(tx, ty, 0);
  p.legs.forEach((l, i) => { l.p.rotation.x = L[i]; l.low.rotation.x = K[i]; });
}

// ------------------------------------------------------------------ dragon
export function dragonModel() {
  const g = new THREE.Group();
  const scales = scaleMaterial(0x4f6a78), belly = bellyMaterial(0xb8ad92), horn = hornMaterial();
  const body = mesh(new THREE.CapsuleGeometry(1.3, 3.6, 8, 20), scales, 0, 2.4, 0); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.85); g.add(body);
  const bel = mesh(new THREE.CapsuleGeometry(1.0, 3.2, 6, 16), belly, 0, 1.75, 0.2); bel.rotation.x = Math.PI / 2; bel.scale.set(1, 1, 0.5); g.add(bel);
  const neck = pivot(0, 3.0, 2.6); g.add(neck);
  for (let i = 0; i < 4; i++) { const n = mesh(sphere(0.78 - i * 0.07, 20, 14), scales, 0, 0.3 + i * 0.36, 0.5 + i * 0.6); n.scale.z = 1.35; neck.add(n); }
  const head = pivot(0, 1.7, 2.7); neck.add(head);
  const skull = mesh(sphere(0.75, 24, 18), scales); skull.scale.set(1, 0.8, 1.15); head.add(skull);
  const snout = mesh(new THREE.CapsuleGeometry(0.42, 1.0, 6, 14), scales, 0, -0.1, 1.15); snout.rotation.x = Math.PI / 2; snout.scale.set(1, 0.8, 1); head.add(snout);
  for (const sx of [-1, 1]) { const brow = mesh(capsule(0.16, 0.6), scales, sx * 0.4, 0.38, 0.4); brow.rotation.x = Math.PI / 2 - 0.3; head.add(brow); }
  const jaw = pivot(0, -0.4, 0.4); head.add(jaw);
  const jm = mesh(new THREE.CapsuleGeometry(0.35, 1.2, 6, 14), belly, 0, 0, 0.8); jm.rotation.x = Math.PI / 2; jm.scale.set(1, 0.6, 1); jaw.add(jm);
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) { const t = mesh(G_('tooth', () => new THREE.ConeGeometry(0.04, 0.17, 6)), horn, sx * 0.28, -0.42, 0.8 + i * 0.2); t.rotation.x = Math.PI; head.add(t); }
  for (const sx of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx * 0.3, 0.5, -0.8), new THREE.Vector3(sx * 0.2, 0.9, -1.9));
    const tg = new THREE.TubeGeometry(curve, 12, 0.16, 8); const pp = tg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pp, i); const k = Math.floor(i / 9) / 12; const c = curve.getPoint(k); v.sub(c).multiplyScalar(1 - k * 0.9).add(c); pp.setXYZ(i, v.x, v.y, v.z); }
    tg.computeVertexNormals();
    head.add(mesh(tg, horn, sx * 0.42, 0.45, -0.3));
    head.add(mesh(sphere(0.09), mat(0x9fe8ff, { basic: true }), sx * 0.42, 0.18, 0.55));
  }
  for (let i = 0; i < 9; i++) { const sp = mesh(G_('spike', () => new THREE.ConeGeometry(0.18, 0.8, 8)), horn, 0, 3.55 - Math.abs(i - 3) * 0.05, 2.4 - i * 0.7); sp.rotation.x = -0.5; g.add(sp); }
  const tail = pivot(0, 2.3, -2.8); g.add(tail);
  let prev = tail;
  for (let i = 0; i < 7; i++) {
    const r = 0.72 - i * 0.09, seg = pivot(0, 0, i === 0 ? 0 : -1.2); prev.add(seg);
    const m = mesh(new THREE.CapsuleGeometry(r, 0.95, 6, 14), scales, 0, 0, -0.6); m.rotation.x = Math.PI / 2; seg.add(m);
    if (i < 6) { const sp = mesh(G_('spike', () => new THREE.ConeGeometry(0.18, 0.8, 8)), horn, 0, r * 0.9, -0.6); sp.scale.setScalar(1 - i * 0.12); sp.rotation.x = -0.6; seg.add(sp); }
    prev = seg;
  }
  for (const [x, z] of [[-1, 1.8], [1, 1.8], [-1, -1.6], [1, -1.6]]) {
    g.add(mesh(new THREE.CapsuleGeometry(0.42, 0.6, 6, 12), scales, x * 1.25, 1.4, z));
    g.add(mesh(new THREE.CapsuleGeometry(0.3, 0.8, 6, 12), scales, x * 1.3, 0.55, z + 0.15));
    for (let c = -1; c <= 1; c++) { const cl = mesh(G_('claw', () => new THREE.ConeGeometry(0.07, 0.35, 6)), horn, x * 1.3 + c * 0.15, 0.1, z + 0.55); cl.rotation.x = Math.PI / 2; g.add(cl); }
  }
  const wings = [];
  const memb = wingMaterial(0x5a2e2c);
  for (const sx of [-1, 1]) {
    const wp = pivot(sx * 1.1, 3.3, 1.2); g.add(wp);
    const bone1 = mesh(new THREE.CapsuleGeometry(0.15, 6.4, 4, 10), scales, sx * 3.5, 0, 0); bone1.rotation.z = Math.PI / 2; wp.add(bone1);
    for (const [fx, fz] of [[2.4, -3.2], [4.4, -3.8], [6.6, -4.2]]) { const fb = mesh(new THREE.CapsuleGeometry(0.07, Math.abs(fz), 3, 8), scales, sx * fx, 0, fz / 2); fb.rotation.x = Math.PI / 2; wp.add(fb); }
    const geo = new THREE.BufferGeometry();
    const P = [[0, 0], [sx * 7, 0], [sx * 6.6, -4.2], [sx * 5.4, -3.2], [sx * 4.4, -3.8], [sx * 3.2, -2.8], [sx * 2.4, -3.2], [sx * 1.2, -2.2], [0, -1.5]];
    const pos = [], uv = [];
    for (let i = 1; i < P.length - 1; i++) for (const q of [P[0], P[i], P[i + 1]]) { pos.push(q[0], 0, q[1]); uv.push(Math.abs(q[0]) / 7, -q[1] / 4.5); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
    const mem = new THREE.Mesh(geo, memb); mem.castShadow = true; wp.add(mem);
    wings.push(wp);
  }
  g.userData.parts = { wings, neck, head, jaw, tail, dragon: true };
  return g;
}
