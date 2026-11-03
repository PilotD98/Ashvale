import * as THREE from 'three';
import { G } from './state.js';
import { ground } from './world.js';
import { mat } from './models.js';

// ---------------- particles ----------------
const parts = [];
const pGeo = new THREE.BoxGeometry(1, 1, 1);
export function burst(pos, color, count = 12, speed = 4, life = 0.6, size = 0.15, grav = 6) {
  const m = mat(color, { basic: true });
  for (let i = 0; i < count; i++) {
    if (parts.length > 400) break;
    const mesh = new THREE.Mesh(pGeo, m);
    mesh.position.copy(pos); mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8));
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    G.scene.add(mesh);
    parts.push({ mesh, v, life, max: life, grav, s0: mesh.scale.x });
  }
}

// ---------------- pooled point lights (fixed count avoids shader recompiles) ----------------
const pool = [];
export function initFx(scene) {
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffffff, 0, 20, 2); scene.add(l); pool.push({ l, t: 0, owner: null }); }
}
function grabLight(color, intensity, owner) {
  let best = pool.find(p => !p.owner && p.t <= 0) || pool.reduce((a, b) => (a.t < b.t ? a : b));
  if (best.owner && best.owner.light === best) best.owner.light = null;
  intensity *= 9;
  best.l.color.set(color); best.l.intensity = intensity; best.owner = owner; best.t = owner ? 999 : 0.25; best.base = intensity;
  return best;
}
export function flash(pos, color, intensity = 4, t = 0.25) { const p = grabLight(color, intensity, null); p.l.position.copy(pos); p.t = t; p.max = t; }

// ---------------- transient meshes (rings, bolts) ----------------
const transients = [];
export function ring(pos, color, radius, t = 0.45) {
  const geo = new THREE.RingGeometry(0.8, 1, 32); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  m.position.copy(pos); m.position.y += 0.3; G.scene.add(m);
  transients.push({ m, t, max: t, update: (k) => { m.scale.setScalar(0.5 + radius * (1 - k)); m.material.opacity = k * 0.8; } });
}
export function bolt(from, to, color = 0xbfe6ff) {
  const pts = []; const segs = 10;
  for (let i = 0; i <= segs; i++) {
    const p = from.clone().lerp(to, i / segs);
    if (i > 0 && i < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9));
    pts.push(p);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true }));
  G.scene.add(m);
  transients.push({ m, t: 0.18, max: 0.18, update: (k) => { m.material.opacity = k; } });
  flash(to, color, 5, 0.2);
}
export function wave(pos, dir, color = 0xcfe8ff) { // shout cone visual
  for (let i = 0; i < 40; i++) {
    const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.0);
    d.y += (Math.random() - 0.5) * 0.4;
    const mesh = new THREE.Mesh(pGeo, mat(color, { basic: true }));
    mesh.position.copy(pos); mesh.scale.setScalar(0.25);
    G.scene.add(mesh); parts.push({ mesh, v: d.multiplyScalar(18 + Math.random() * 10), life: 0.6, max: 0.6, grav: 0, s0: 0.3 });
  }
}

// ---------------- projectiles ----------------
export const projectiles = [];
const sphereGeo = new THREE.IcosahedronGeometry(1, 1);
export function spawnProjectile(o) {
  let mesh;
  if (o.kind === 'arrow') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), mat(0x5a3a1c, { basic: true }));
  } else {
    const col = o.kind === 'fire' ? 0xff8a2a : 0x9fe4ff;
    mesh = new THREE.Mesh(sphereGeo, mat(col, { basic: true })); mesh.scale.setScalar(o.size ?? 0.3);
  }
  mesh.position.copy(o.pos); G.scene.add(mesh);
  const p = { ...o, mesh, vel: o.dir.clone().normalize().multiplyScalar(o.speed), life: o.life ?? 3 };
  if (o.kind !== 'arrow') p.light = grabLight(o.kind === 'fire' ? 0xff7a2a : 0x88ccff, 3, p);
  projectiles.push(p);
  return p;
}

function endProjectile(p, i) {
  G.scene.remove(p.mesh);
  if (p.light) { p.light.owner = null; p.light.t = 0; p.light.l.intensity = 0; }
  projectiles.splice(i, 1);
}

export function updateFx(dt, hooks) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { G.scene.remove(p.mesh); parts.splice(i, 1); continue; }
    p.v.y -= p.grav * dt; p.mesh.position.addScaledVector(p.v, dt);
    p.mesh.scale.setScalar(p.s0 * (p.life / p.max));
  }
  for (let i = transients.length - 1; i >= 0; i--) {
    const t = transients[i]; t.t -= dt;
    if (t.t <= 0) { G.scene.remove(t.m); t.m.geometry.dispose(); t.m.material.dispose(); transients.splice(i, 1); continue; }
    t.update(t.t / t.max);
  }
  for (const p of pool) {
    if (p.owner) continue;
    if (p.t > 0) { p.t -= dt; p.l.intensity = Math.max(0, p.base * (p.t / (p.max || 0.25))); } else p.l.intensity = 0;
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.grav) p.vel.y -= p.grav * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.kind === 'arrow') p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
    else if (Math.random() < 0.6) burst(p.mesh.position, p.kind === 'fire' ? 0xffb030 : 0xd8f4ff, 1, 1, 0.3, 0.12, -1);
    if (p.light) p.light.l.position.copy(p.mesh.position);
    const pos = p.mesh.position;
    let done = p.life <= 0;
    if (!done && pos.y < ground(pos.x, pos.z)) { done = true; hooks.onImpact(p, null); }
    if (!done) {
      const hit = hooks.testHit(p);
      if (hit) { done = true; hooks.onImpact(p, hit); }
    }
    if (done) endProjectile(p, i);
  }
}
