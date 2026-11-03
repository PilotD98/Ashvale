import * as THREE from 'three';
import { G } from './state.js';
import { ENEMIES, SPAWNS, LOCATIONS } from './data.js';
import { ground, resolveCollision, addCircle, WATER } from './world.js';
import { humanoid, quadruped, dragonModel, animHumanoid, animQuad } from './models.js';
import { spawnProjectile, burst, flash } from './fx.js';
import { sfx } from './audio.js';
import { wrapAngle, rand } from './util.js';
import { damagePlayer, detectRange } from './player.js';
import { onKill } from './logic.js';
import { notify } from './ui.js';

const V = new THREE.Vector3();
const respawnQueue = [];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function buildModel(type) {
  switch (ENEMIES[type].model) {
    case 'wolf': return quadruped('wolf');
    case 'bear': return quadruped('bear');
    case 'bandit': {
      const helm = Math.random() < 0.5, leather = pick([0x5a3a24, 0x4a3020, 0x6a4a2e]);
      return humanoid({
        skin: pick([0xd9a882, 0xc89070, 0xe0b496]), hair: pick([0x2a1a10, 0x5a3418, 0x8a5a2a]), hairStyle: pick(['short', 'ponytail', 'long']),
        beard: pick([0x2a1a10, 0x5a3418, 0x6a4020]), beardStyle: pick(['full', 'braided']),
        face: { paint: Math.random() < 0.6 ? pick([0x8a1a1a, 0x1a1a1a, 0x2a3a6a]) : undefined, paintStyle: pick(['band', 'claws']), angry: true, scar: Math.random() < 0.3, eyeCol: pick([0x4a3a2a, 0x5a7a9a]) },
        outfit: { type: 'leather', base: leather, trim: 0x2a1a10 }, pants: { base: pick([0x3a2e22, 0x4a3a2a]), wraps: 0x6a5a40 }, boots: 0x2a1c12,
        mantle: Math.random() < 0.5 ? pick([0x6a5a48, 0x4a4038]) : undefined, pauldrons: Math.random() < 0.4 ? 'fur' : undefined,
        helmet: helm ? { col: 0x7a7a7a, rust: true } : undefined, gloves: 0x3a2618,
        weapon: pick(['axe', 'sword']), shield: Math.random() < 0.4 ? { paint: 0x8a1a1a, design: 'claw', accent: 0xe0d0b0 } : undefined,
      });
    }
    case 'archer': return humanoid({
      skin: pick([0xd9a882, 0xc89070]), hair: 0x6a3a1a, face: { paint: 0x2a2a2a, paintStyle: 'band', eyeCol: 0x4a6a3a },
      outfit: { type: 'leather', base: 0x4a4a32, trim: 0x2a2418, bracers: 0x3a2a1a }, pants: { base: 0x3a3022, wraps: 0x5a4a30 }, boots: 0x2a1c12,
      hood: 0x3a4a2a, cape: 0x3a4a2a, gloves: 0x3a2618, weapon: 'bow',
    });
    case 'chief': return humanoid({
      scale: 1.12, skin: 0xd09878, hair: 0xa04a1a, beard: 0xa04a1a, beardStyle: 'braided', face: { paint: 0x8a1a1a, paintStyle: 'claws', angry: true, scar: true, eyeCol: 0x6a8a5a, age: 0.4 },
      outfit: { type: 'plate', base: 0x6a6a6a, rust: 0.4 }, pants: { base: 0x3a2a1a, metal: true }, boots: 0x2a1c12,
      helmet: { col: 0x5a5a5a, horns: true, rust: true }, mantle: 0x5a4030, pauldrons: 'fur', cape: 0x7a1a1a, capeTrim: 0x3a0a0a, gloves: 0x2a1a10, weapon: 'axe',
    });
    case 'draugr': return humanoid({
      undead: true, skin: 0x7a8274, face: { eyeGlow: 0x66ccff },
      outfit: { type: 'wraps', base: 0x4a463c }, pants: { base: 0x3a362e }, boots: 0x2a2620, skirt: 'tunic',
      helmet: Math.random() < 0.6 ? { col: 0x5a5a50, rust: true } : undefined, hair: 0x9a9a8a, hairStyle: 'long', beard: Math.random() < 0.5 ? 0x8a8a7a : undefined, beardStyle: 'long',
      weapon: pick(['axe', 'sword']), pauldrons: Math.random() < 0.4 ? 'metal' : undefined,
    });
    case 'lord': return humanoid({
      scale: 1.28, undead: true, skin: 0x6a7264, face: { eyeGlow: 0x66ccff },
      outfit: { type: 'plate', base: 0x7a6440, accent: 0x66ccff, runes: true, rust: 0.35 }, pants: { base: 0x2a2620, metal: true }, boots: 0x1a1810,
      helmet: { col: 0x6a5a3a, horns: true, band: 0x8a7040 }, pauldrons: 'metal', mantle: 0x3a3830, cape: 0x1a2a4a, capeTrim: 0x0a1020,
      beard: 0x8a8a7a, beardStyle: 'long', weapon: 'axe', shield: { paint: 0x1a2a4a, design: 'quarters' },
    });
    case 'dragon': return dragonModel();
  }
}

export function spawnEnemy(type, x, z, o = {}) {
  const def = ENEMIES[type];
  const mesh = buildModel(type);
  const e = {
    type, def, mesh, pos: new THREE.Vector3(x, ground(x, z), z), home: { x, z }, yaw: Math.random() * 6.28,
    hp: def.hp, maxHp: def.hp, state: 'idle', wanderT: rand(0, 4), wander: null, cd: 0, atk: 0, atkHit: true,
    slowT: 0, burnT: 0, stunT: 0, kb: new THREE.Vector3(), dead: false, deadT: 0, looted: false, phase: Math.random() * 6,
    tag: o.tag, moving: 0, parts: mesh.userData.parts,
  };
  mesh.position.copy(e.pos);
  // clone materials per enemy so a hit can flash just this one
  e.mats = [];
  if (type !== 'dragon') mesh.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); for (const m of [].concat(o.material)) if (m.emissive) { m.userData.e0 = m.emissive.clone(); e.mats.push(m); } } });
  e.anim = { t: Math.random() * 10, phase: e.phase, move: 0, stance: false, atk: 0, atkKind: def.ranged ? 'bow' : 'swing', hitT: 0, stun: false, deadT: -1 };
  e.hitT = 0;
  G.scene.add(mesh);
  G.enemies.push(e);
  if (type === 'dragon') initDragon(e);
  return e;
}

export function spawnAllEnemies() {
  for (const e of G.enemies) G.scene.remove(e.mesh);
  G.enemies.length = 0; respawnQueue.length = 0;
  for (const s of SPAWNS) {
    const def = ENEMIES[s.type];
    if (def.unique && G.flags.killed[def.unique]) continue;
    if (s.tag === 'tower' && G.quests.tower && G.quests.tower.stage >= 1) continue;
    for (let i = 0; i < s.n; i++) {
      const sp = s.spread ?? 6, a = Math.random() * 6.28, r = Math.random() * sp;
      spawnEnemy(s.type, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, { tag: s.tag });
    }
  }
  maybeSpawnDragon();
}

export function maybeSpawnDragon() {
  const q = G.quests.main;
  if (q && q.stage === 5 && !G.flags.killed.dragon && !G.enemies.some(e => e.type === 'dragon')) {
    const L = LOCATIONS.frostspire;
    spawnEnemy('dragon', L.x + 40, L.z);
  }
}

function alertNearby(src) {
  for (const o of G.enemies) {
    if (o === src || o.dead || o.state === 'chase') continue;
    if (Math.hypot(o.pos.x - src.pos.x, o.pos.z - src.pos.z) < 18) o.state = 'chase';
  }
}

export function damageEnemy(e, amt, o = {}) {
  if (e.dead) return;
  e.hp -= amt;
  e.hitT = 1; e.anim && (e.anim.hitSide = Math.random() < 0.5 ? -1 : 1);
  G.target = e; G.targetT = 6;
  if (e.state !== 'chase') { e.state = 'chase'; alertNearby(e); }
  const c = V.copy(e.pos); c.y += e.def.height * 0.6;
  burst(c, o.color ?? 0xaa2222, o.count ?? 8, 4, 0.5, 0.12);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true; e.deadT = 0; e.hp = 0;
  e.loot = e.def.loot();
  sfx.death();
  if (e.type === 'dragon') {
    sfx.roar();
    for (let i = 0; i < 6; i++) setTimeout(() => burst(e.pos.clone().add(new THREE.Vector3(0, 3, 0)), 0xffb040, 30, 10, 1.5, 0.3, 1), i * 250);
    notify('Dragon soul absorbed!', 'gold');
  }
  if (!e.def.unique) respawnQueue.push({ type: e.type, x: e.home.x, z: e.home.z, tag: e.tag, t: 300 });
  onKill(e);
}

const FLASH = new THREE.Color(0.9, 0.12, 0.05);
function hitFlash(e, k) {
  if ((e.lastFlash || 0) === k) return; e.lastFlash = k;
  for (const m of e.mats) m.emissive.copy(m.userData.e0).lerp(FLASH, k * 0.55);
}

function faceTo(e, tx, tz, dt, rate = 8) {
  const target = Math.atan2(tx - e.pos.x, tz - e.pos.z);
  e.yaw += wrapAngle(target - e.yaw) * Math.min(1, dt * rate);
}
function moveToward(e, tx, tz, spd, dt) {
  const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return;
  const step = Math.min(d, spd * dt);
  e.pos.x += dx / d * step; e.pos.z += dz / d * step; e.moving = spd;
  faceTo(e, tx, tz, dt);
}

// ------------------------------------------------------------ main enemy update
export function updateEnemies(dt) {
  const P = G.player;
  for (let i = respawnQueue.length - 1; i >= 0; i--) {
    const r = respawnQueue[i]; r.t -= dt;
    if (r.t <= 0 && Math.hypot(P.pos.x - r.x, P.pos.z - r.z) > 90) {
      if (r.tag === 'tower' && G.quests.tower && G.quests.tower.stage >= 1) { respawnQueue.splice(i, 1); continue; }
      spawnEnemy(r.type, r.x, r.z, { tag: r.tag }); respawnQueue.splice(i, 1);
    }
  }
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dead) {
      e.deadT += dt;
      const f = Math.min(e.deadT / 0.6, 1);
      if (e.type === 'dragon') { e.pos.y = Math.max(ground(e.pos.x, e.pos.z), e.pos.y - 15 * dt); e.mesh.position.copy(e.pos); e.mesh.rotation.z = f * 0.4; }
      else if (e.deadT < 2.5) {
        e.anim.deadT = e.deadT; e.anim.atk = 0; e.anim.hitT = 0; e.anim.move = 0; e.anim.stun = false;
        (e.parts.quad ? animQuad : animHumanoid)(e.parts, e.anim, dt);
        hitFlash(e, 0);
      }
      if ((e.looted && e.deadT > 20) || (e.deadT > 180 && e.type !== 'dragon')) { G.scene.remove(e.mesh); G.enemies.splice(i, 1); if (G.target === e) G.target = null; }
      continue;
    }
    if (e.type === 'dragon') { updateDragon(e, dt); continue; }
    const def = e.def;
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, d = Math.hypot(dx, dz);
    if (d > 170 && e.state === 'idle') { e.mesh.visible = false; continue; }
    e.mesh.visible = true;
    e.cd -= dt; e.slowT -= dt; e.stunT -= dt; e.moving = 0; e.fleeT = Math.max(0, (e.fleeT || 0) - dt);
    if (P.invisT > 0 && e.state === 'chase' && !e.fleeT) { e.state = 'idle'; e.wander = null; }
    if (e.burnT > 0) {
      e.burnT -= dt; e.hp -= 5 * dt;
      if (Math.random() < 0.3) burst(V.copy(e.pos).setY(e.pos.y + def.height * 0.6), 0xff8a2a, 1, 2, 0.4, 0.15, -2);
      if (e.hp <= 0) { killEnemy(e); continue; }
    }
    const spd = def.speed * (e.slowT > 0 ? 0.45 : 1);
    const distHome = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
    if (P.dead && e.state === 'chase') e.state = 'return';

    if (e.stunT <= 0) {
      if (e.state === 'idle') {
        e.wanderT -= dt;
        if (e.wanderT <= 0) { const a = Math.random() * 6.28, r = Math.random() * 9; e.wander = { x: e.home.x + Math.cos(a) * r, z: e.home.z + Math.sin(a) * r }; e.wanderT = rand(4, 9); }
        if (e.wander) { moveToward(e, e.wander.x, e.wander.z, spd * 0.3, dt); if (Math.hypot(e.wander.x - e.pos.x, e.wander.z - e.pos.z) < 0.5) e.wander = null; }
        if (d < detectRange(e) && !P.dead && Math.abs(P.pos.y - e.pos.y) < 12) { e.state = 'chase'; alertNearby(e); }
      } else if (e.fleeT > 0) {
        moveToward(e, e.pos.x - dx, e.pos.z - dz, spd * 0.9, dt);
        if (Math.random() < 0.05) burst(V.copy(e.pos).setY(e.pos.y + def.height + 0.2), 0xc08ad8, 1, 1, 0.5, 0.1, -1);
      } else if (e.state === 'chase') {
        if (distHome > 75) e.state = 'return';
        else if (def.ranged) {
          if (d > def.range * 0.8) moveToward(e, P.pos.x, P.pos.z, spd, dt);
          else if (d < 7) moveToward(e, e.pos.x - dx, e.pos.z - dz, spd * 0.8, dt);
          faceTo(e, P.pos.x, P.pos.z, dt);
          if (d < def.range && e.cd <= 0 && e.atk <= 0) { e.cd = def.cd + Math.random() * 0.6; e.atk = 1; e.atkHit = false; }
        } else {
          const reach = def.range + 0.35;
          if (d > reach * 0.9) moveToward(e, P.pos.x, P.pos.z, spd, dt); else faceTo(e, P.pos.x, P.pos.z, dt);
          if (d <= reach && e.cd <= 0 && e.atk <= 0) { e.atk = 1; e.atkHit = false; e.cd = def.cd + Math.random() * 0.4; }
        }
      } else if (e.state === 'return') {
        moveToward(e, e.home.x, e.home.z, spd, dt);
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
        if (distHome < 2) { e.state = 'idle'; e.hp = e.maxHp; }
        else if (d < def.aggro * 0.5 && distHome < 50 && !P.dead) e.state = 'chase';
      }
    }
    if (e.atk > 0) {
      if (e.stunT > 0 || e.hitT > 0.6) e.atk = Math.min(e.atk, e.atkHit ? e.atk : 0); // getting hit / staggered interrupts a wind-up
      e.atk -= dt / (def.ranged ? 0.9 : 0.6);
      if (!e.atkHit && e.atk < 0.5 && e.atk > 0) {
        e.atkHit = true;
        if (def.ranged) {
          const from = e.pos.clone(); from.y += 1.5;
          const to = P.pos.clone(); to.y += 1.3; to.addScaledVector(P.vel, d / 38);
          spawnProjectile({ kind: 'arrow', pos: from, dir: to.sub(from), speed: 38, owner: 'enemy', dmg: def.dmg, life: 2, src: e });
          sfx.arrow();
        } else if (Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < def.range + 0.8 && e.stunT <= 0 && !e.fleeT) damagePlayer(def.dmg, e, 'melee');
      }
    }
    e.hitT = Math.max(0, e.hitT - dt / 0.35);
    // knockback
    if (e.kb.lengthSq() > 0.01) { e.pos.addScaledVector(e.kb, dt); e.kb.multiplyScalar(Math.exp(-5 * dt)); }
    // separation
    for (const o of G.enemies) {
      if (o === e || o.dead || o.type === 'dragon') continue;
      const sx = e.pos.x - o.pos.x, sz = e.pos.z - o.pos.z, sd = Math.hypot(sx, sz), m = def.radius + o.def.radius;
      if (sd < m && sd > 1e-4) { const push = (m - sd) * 0.5; e.pos.x += sx / sd * push; e.pos.z += sz / sd * push; }
    }
    { const px = e.pos.x - P.pos.x, pz = e.pos.z - P.pos.z, pd = Math.hypot(px, pz), m = def.radius + 0.45;
      if (pd < m && pd > 1e-4 && !P.dead) { e.pos.x = P.pos.x + px / pd * m; e.pos.z = P.pos.z + pz / pd * m; } }
    resolveCollision(e.pos, def.radius * 0.8);
    const gy = ground(e.pos.x, e.pos.z);
    e.pos.y = Math.max(gy, WATER - def.height * 0.55);
    e.mesh.position.copy(e.pos);
    e.mesh.rotation.y = e.yaw;
    e.phase += dt * (e.moving ? 2.2 + e.moving * 0.9 : 0);
    const A = e.anim;
    A.phase = e.phase; A.move = Math.min(1, e.moving / (e.parts.quad ? 7 : 5.5)); A.stance = e.state === 'chase' && d < 12 && !e.fleeT;
    A.atk = Math.max(0, e.atk); A.hitT = e.hitT; A.stun = e.stunT > 0.3; A.deadT = -1;
    if (d < 90) (e.parts.quad ? animQuad : animHumanoid)(e.parts, A, dt);
    hitFlash(e, e.hitT);
  }
}

// ------------------------------------------------------------ dragon
function initDragon(e) {
  const L = LOCATIONS.frostspire;
  e.center = { x: L.x, z: L.z, y: ground(L.x, L.z) };
  e.dphase = 'fly'; e.phaseT = 16; e.breathT = 4; e.ang = 0; e.flyY = e.center.y + 30;
  e.pos.y = e.flyY; e.state = 'chase'; e.vel = new THREE.Vector3(); e.announced = false;
}

export function forceDragonLand(e) {
  if (e.dphase === 'fly' || e.dphase === 'takeoff') { e.dphase = 'land'; notify('Vyrmathax is forced out of the sky!', 'gold'); }
}

function dragonBreath(e, count, spread) {
  const P = G.player;
  const from = e.pos.clone().add(new THREE.Vector3(Math.sin(e.yaw) * 5, e.dphase === 'ground' ? 3.2 : 1.5, Math.cos(e.yaw) * 5));
  const to = P.pos.clone(); to.y += 1;
  for (let i = 0; i < count; i++) {
    const dir = to.clone().sub(from).normalize();
    dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread * 0.5; dir.z += (Math.random() - 0.5) * spread;
    spawnProjectile({ kind: 'frost', pos: from.clone(), dir, speed: 30 + Math.random() * 6, owner: 'enemy', dmg: 8, slow: 2, life: 3, size: 0.45, src: e });
  }
  sfx.frost(); e.jawT = 0.8;
}

function updateDragon(e, dt) {
  const P = G.player, c = e.center;
  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, d = Math.hypot(dx, dz);
  const pNear = Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 140 && !P.dead;
  if (pNear && !e.announced) { e.announced = true; sfx.roar(); notify('A dragon circles Frostspire...', 'gold'); }
  e.breathT -= dt; e.phaseT -= dt; e.cd -= dt; e.jawT = Math.max(0, (e.jawT || 0) - dt);
  const t = performance.now() * 0.001;
  const p = e.parts;
  if (e.burnT > 0) { e.burnT -= dt; e.hp -= 5 * dt; if (e.hp <= 0) { killEnemy(e); return; } }

  if (e.dphase === 'fly') {
    e.ang += dt * 0.38;
    const tx = c.x + Math.cos(e.ang) * 42, tz = c.z + Math.sin(e.ang) * 42, ty = e.flyY + Math.sin(t * 0.7) * 3;
    const tv = V.set(tx - e.pos.x, ty - e.pos.y, tz - e.pos.z);
    e.pos.addScaledVector(tv, Math.min(1, dt * 1.5));
    e.yaw += wrapAngle(Math.atan2(-Math.sin(e.ang), Math.cos(e.ang)) - e.yaw) * Math.min(1, dt * 3);
    if (pNear && e.breathT <= 0 && e.pos.distanceTo(P.pos) < 90) { dragonBreath(e, 7, 0.25); e.breathT = 3.2; }
    if (pNear && e.phaseT <= 0) e.dphase = 'land';
    p.wings[0].rotation.z = Math.sin(t * 4) * 0.6; p.wings[1].rotation.z = -Math.sin(t * 4) * 0.6;
  } else if (e.dphase === 'land') {
    const ox = d > 0.1 ? -dx / d : 1, oz = d > 0.1 ? -dz / d : 0;
    const lx = P.pos.x + ox * 10, lz = P.pos.z + oz * 10;
    const ly = ground(lx, lz);
    const tv = V.set(lx - e.pos.x, ly - e.pos.y, lz - e.pos.z), dist = tv.length();
    e.pos.addScaledVector(tv.normalize(), Math.min(dist, 22 * dt));
    faceTo(e, P.pos.x, P.pos.z, dt, 4);
    p.wings[0].rotation.z = Math.sin(t * 6) * 0.5; p.wings[1].rotation.z = -Math.sin(t * 6) * 0.5;
    if (dist < 1.5) { e.dphase = 'ground'; e.phaseT = 14; sfx.roar(); burst(e.pos.clone(), 0xeeeeff, 30, 8, 0.8, 0.3); }
  } else if (e.dphase === 'ground') {
    faceTo(e, P.pos.x, P.pos.z, dt, 3);
    if (d > 7.5 && e.atk <= 0) {
      e.pos.x += dx / d * 4.5 * dt * (e.slowT > 0 ? 0.5 : 1); e.pos.z += dz / d * 4.5 * dt * (e.slowT > 0 ? 0.5 : 1);
    }
    if (d < 8.5 && e.cd <= 0 && e.atk <= 0) { e.atk = 1; e.atkHit = false; e.cd = 2.2; }
    if (e.atk > 0) {
      e.atk -= dt / 0.8; e.jawT = 0.3;
      if (!e.atkHit && e.atk < 0.4) { e.atkHit = true; if (d < 9.5) damagePlayer(e.def.dmg, e, 'melee'); }
    }
    if (e.breathT <= 0 && d < 30) { dragonBreath(e, 9, 0.35); e.breathT = 5; }
    e.pos.y = ground(e.pos.x, e.pos.z);
    p.wings[0].rotation.z = 0.9; p.wings[1].rotation.z = -0.9;
    if (e.phaseT <= 0 || Math.hypot(e.pos.x - c.x, e.pos.z - c.z) > 90) { e.dphase = 'takeoff'; }
  } else if (e.dphase === 'takeoff') {
    e.pos.y += 12 * dt;
    p.wings[0].rotation.z = Math.sin(t * 7) * 0.7; p.wings[1].rotation.z = -Math.sin(t * 7) * 0.7;
    if (e.pos.y >= e.flyY) { e.dphase = 'fly'; e.phaseT = 14 + Math.random() * 6; e.ang = Math.atan2(e.pos.z - c.z, e.pos.x - c.x); }
  }
  e.slowT -= dt;
  p.jaw.rotation.x = e.jawT > 0 ? 0.5 : 0.05;
  p.tail.rotation.y = Math.sin(t * 1.5) * 0.3;
  e.hitT = Math.max(0, (e.hitT || 0) - dt / 0.4);
  p.neck.rotation.x = (e.dphase === 'ground' && e.atk > 0 ? Math.sin((1 - e.atk) * Math.PI) * 0.5 : Math.sin(t * 0.8) * 0.06) - e.hitT * 0.35;
  p.head.rotation.y = Math.sin(t * 0.5) * 0.2 * (e.dphase === 'ground' ? 1 : 0.3);
  e.mesh.position.copy(e.pos); e.mesh.rotation.y = e.yaw;
  e.mesh.rotation.z = e.dphase === 'fly' ? -0.25 : 0;
}

// ------------------------------------------------------------ NPCs
export const NPC_DEFS = [
  { id: 'maren', name: 'Elder Maren', x: 0, z: -18, look: { build: 'female', skin: 0xe2b89a, hair: 0xd8d8d8, hairStyle: 'bun', face: { age: 1, eyeCol: 0x6a8aa8, female: true },
      outfit: { type: 'robe', base: 0x4a2e66, trim: 0x2a1840, accent: 0xd8b050, motif: 'knot' }, skirt: 'robe', cape: 0x2a1840, capeTrim: 0xd8b050, boots: 0x3a2a1c } },
  { id: 'torvald', name: 'Torvald the Hunter', x: 6, z: 33, look: { skin: 0xd09878, hair: 0x6b4a2a, beard: 0x6b4a2a, beardStyle: 'full', face: { eyeCol: 0x4a6a3a, age: 0.4, scar: true },
      outfit: { type: 'leather', base: 0x5a4a30, trim: 0x2a1c10 }, pants: { base: 0x4a3a2a, wraps: 0x7a6a50 }, mantle: 0x8a7a5a, pauldrons: 'fur', gloves: 0x3a2618, weapon: 'bow' } },
  { id: 'brenna', name: 'Brenna the Smith', x: 9, z: 17.5, look: { build: 'female', skin: 0xe0ae8c, hair: 0xb8541a, hairStyle: 'braid', face: { female: true, eyeCol: 0x5a7a4a },
      outfit: { type: 'tunic', base: 0x6a3a2a, trim: 0x3a2018, accent: 0xc8a060, apron: 0x4a3020 }, bareArms: true, pants: { base: 0x3a3a3a }, gloves: 0x2a1a10, weapon: 'hammer' } },
  { id: 'hilde', name: 'Old Hilde', x: 18, z: -8, look: { build: 'female', skin: 0xe2b89a, hair: 0xeeeeee, hairStyle: 'long', face: { age: 1, female: true, eyeCol: 0x7a9a6a },
      outfit: { type: 'robe', base: 0x3a5a4a, trim: 0x2a3a2a, accent: 0xb8c890, motif: 'diamond' }, skirt: 'robe', hood: 0x2a3a2a, boots: 0x3a2a1c } },
  { id: 'ysolde', name: 'Ysolde the Trader', x: -16, z: 18.2, look: { build: 'female', skin: 0xc89070, hair: 0x2a1a0a, hairStyle: 'ponytail', face: { female: true, eyeCol: 0x5a3a20 },
      outfit: { type: 'robe', base: 0x8a6a2a, trim: 0x5a2a1a, accent: 0xe8d090, motif: 'diamond' }, skirt: 'robe', boots: 0x4a2a1c } },
  { id: 'gunnar', name: 'Gunnar, Innkeeper', x: -17, z: -6, look: { skin: 0xe0ae8c, hair: 0x8a6a4a, hairStyle: 'bald', beard: 0x8a6a4a, beardStyle: 'long', face: { age: 0.6, eyeCol: 0x5a7a9a },
      outfit: { type: 'tunic', base: 0x7a6a5a, trim: 0x4a3a2a, accent: 0xc8b080, apron: 0xd8ccb0 }, pants: { base: 0x3a2a1a } } },
  { id: 'rolf', name: 'Captain Rolf', x: -12, z: 36, look: { skin: 0xd8a080, hair: 0x4a3a2a, beard: 0x4a3a2a, beardStyle: 'full', face: { eyeCol: 0x5a7a9a, scar: true, age: 0.5 },
      outfit: { type: 'chain', tabard: 0x2a4a7a, accent: 0xd8b050 }, pants: { base: 0x3a3a3a, metal: true }, helmet: { col: 0x9a9a9a }, pauldrons: 'metal', cape: 0x2a4a7a, gloves: 0x3a2618,
      weapon: 'sword', shield: { paint: 0x2a4a7a, design: 'stripe' } } },
];

export function createNPCs() {
  for (const d of NPC_DEFS) {
    const mesh = humanoid(d.look);
    const pos = new THREE.Vector3(d.x, ground(d.x, d.z), d.z);
    mesh.position.copy(pos); G.scene.add(mesh);
    addCircle(d.x, d.z, 0.5);
    G.npcs.push({ ...d, mesh, pos, yaw: Math.atan2(-d.x, -d.z), phase: Math.random() * 6, parts: mesh.userData.parts,
      anim: { t: Math.random() * 10, phase: Math.random() * 6, move: 0, stance: false, atk: 0, hitT: 0, stun: false, deadT: -1 } });
  }
}

export function updateNPCs(dt) {
  const P = G.player;
  for (const n of G.npcs) {
    const d = Math.hypot(P.pos.x - n.pos.x, P.pos.z - n.pos.z);
    if (d < 7) n.yaw += wrapAngle(Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z) - n.yaw) * Math.min(1, dt * 4);
    n.mesh.rotation.y = n.yaw;
    if (d > 80) continue;
    // Brenna works the anvil when you're not talking to her
    if (n.id === 'brenna' && d > 5) { n.hammerT = (n.hammerT || 0) - dt; if (n.hammerT <= 0) { n.hammerT = 1.3; n.anim.atk = 1; } }
    n.anim.atk = Math.max(0, n.anim.atk - dt / 0.6);
    animHumanoid(n.parts, n.anim, dt);
  }
}
