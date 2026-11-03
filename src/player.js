import * as THREE from 'three';
import { G } from './state.js';
import { ground, resolveCollision, WATER, daylight } from './world.js';
import { WEAPONS, ARMORS, ABILITIES, SKILLS, PERKS } from './data.js';
import { spawnProjectile, burst, ring, bolt, wave, flash } from './fx.js';
import { damageEnemy, forceDragonLand } from './entities.js';
import { sfx } from './audio.js';
import { clamp } from './util.js';
import { notify, damageFlash, showDeath } from './ui.js';
import { addXP } from './logic.js';
import { bootMaterial, outfitMaterial, bladeMaterial } from './charTex.js';
import { bladeGeo } from './models.js';

const F = new THREE.Vector3(), R = new THREE.Vector3(), T = new THREE.Vector3();
let viewSword, viewHand, swordBlade;

export function newPlayer() {
  const skills = {};
  for (const k in SKILLS) skills[k] = { lvl: SKILLS[k].start, xp: 0 };
  return {
    pos: new THREE.Vector3(2, 0, 30), vel: new THREE.Vector3(), vy: 0, yaw: 0, pitch: 0, onGround: true,
    hp: 100, maxHp: 100, mp: 100, maxMp: 100, sp: 100, maxSp: 100,
    level: 1, xp: 0, perkPts: 1, attrPts: 0, perks: {}, skills,
    spells: { firebolt: true, frost: true, heal: true },
    hotbar: ['firebolt', 'frost', 'heal', null, null, null, null, null],
    cds: {}, shoutCd: 0, atkCd: 0, castCd: 0, swingT: 0, swingKind: 'light', castT: 0, pendingHit: -1, pendingPower: false,
    atkHold: -1, spUseT: 0, mpUseT: 0, hurtT: 99, blocking: false, dead: false, swimming: false, stepT: 0,
    crouch: false, wardT: 0, wardHp: 0, stoneT: 0, invisT: 0, dodgeT: 0, dodgeDir: new THREE.Vector3(), avoidCd: 0, shadowCd: 0, sneakT: 0,
  };
}

// First-person rig: shoulder pivot → gloved forearm + hand → sword. Swings are keyframed on the pivot and the sword.
let rig, swordG;
export function buildViewModel(camera) {
  rig = new THREE.Group(); rig.position.set(0.3, -0.38, -0.16); camera.add(rig);
  const glove = bootMaterial(0x3a2618), sleeve = outfitMaterial({ type: 'leather', base: 0x5a4030, trim: 0x2a1a10, bracers: 0x3a2618 }, 'sleeve');
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 14), sleeve); fore.rotation.x = Math.PI / 2; fore.position.z = -0.32; rig.add(fore);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 8, 16), glove); cuff.position.z = -0.46; rig.add(cuff);
  const hand = new THREE.Group(); hand.position.z = -0.52; rig.add(hand);
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), glove); fist.scale.set(0.95, 1.15, 0.9); hand.add(fist);
  for (let i = 0; i < 4; i++) { const k = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 3, 6), glove); k.rotation.z = Math.PI / 2; k.position.set(-0.018, 0.035 - i * 0.022, 0.035); hand.add(k); }
  swordG = new THREE.Group(); hand.add(swordG);
  const leather = bootMaterial(0x2a1a10), brass = new THREE.MeshStandardMaterial({ color: 0x9a7a3a, roughness: 0.3, metalness: 0.9 });
  swordG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.023, 0.2, 10), leather));
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), brass); pommel.position.y = -0.115; swordG.add(pommel);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.045), brass); guard.position.y = 0.115; swordG.add(guard);
  for (const sx of [-1, 1]) { const q = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), brass); q.position.set(sx * 0.12, 0.115, 0); swordG.add(q); }
  swordBlade = new THREE.Mesh(bladeGeo(), bladeMaterial(0xc8ccd2).clone()); swordBlade.position.y = 0.13; swordG.add(swordBlade);
  rig.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  viewSword = rig;
  viewHand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 2), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0 }));
  viewHand.position.set(-0.32, -0.3, -0.62); camera.add(viewHand);
  applyPose(POSES.idle);
}

// pose = [rigRotX, rigRotY, rigRotZ, swordRotX, swordRotY, swordRotZ, rigOffsetZ]
const POSES = {
  idle:  [0.06, 0.1, 0.0, -0.55, 0.0, 0.32, 0],
  block: [0.62, 0.3, 0.0, -0.25, 0.0, 1.38, 0.04],
  charge:[1.1, -0.25, -0.1, 0.5, 0.0, 0.25, 0.06],
};
// keyframes: [time 0..1, pose, easing into this key]. Slashes sweep the blade across the screen like a real cut.
const SWINGS = {
  slashA: [[0, POSES.idle], [0.3, [0.42, -0.62, -0.25, -0.3, 0.0, -1.25, 0.04], 'out'], [0.5, [0.12, 0.12, 0.0, -0.55, 0.0, 0.35, -0.12], 'in'], [0.68, [-0.3, 0.7, 0.2, -0.7, 0.0, 1.85, -0.05], 'out'], [1, POSES.idle, 'io']],
  slashB: [[0, POSES.idle], [0.3, [0.45, 0.55, 0.25, -0.3, 0.0, 1.35, 0.04], 'out'], [0.5, [0.12, -0.05, 0.0, -0.55, 0.0, -0.3, -0.12], 'in'], [0.68, [-0.3, -0.72, -0.2, -0.7, 0.0, -1.8, -0.05], 'out'], [1, POSES.idle, 'io']],
  chop:   [[0, POSES.idle], [0.32, POSES.charge, 'out'], [0.5, [0.15, 0.0, 0.0, -0.9, 0.0, 0.1, -0.14], 'in'], [0.68, [-0.6, 0.05, 0.0, -1.9, 0.0, 0.1, -0.08], 'out'], [1, POSES.idle, 'io']],
  power:  [[0, POSES.charge], [0.25, [0.1, 0.0, 0.0, -1.0, 0.0, 0.1, -0.2], 'in'], [0.45, [-0.7, 0.08, 0.0, -2.0, 0.0, 0.1, -0.1], 'out'], [1, POSES.idle, 'io']],
  spin:   [[0, POSES.idle], [0.15, [0.3, -0.9, -0.3, -0.4, 0.0, -1.4, 0.0], 'out'], [0.7, [0.2, 1.0, 0.3, -0.5, 0.0, 1.5, -0.05], 'io'], [1, POSES.idle, 'io']],
  bash:   [[0, POSES.block], [0.35, [0.62, 0.25, 0.0, -0.25, 0.0, 1.38, -0.3], 'in'], [1, POSES.block, 'io']],
};
const EASE = { in: (t) => t * t * t, out: (t) => 1 - Math.pow(1 - t, 3), io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) };
const cur = POSES.idle.slice();
function sampleSwing(name, k, out) {
  const kf = SWINGS[name];
  for (let i = 1; i < kf.length; i++) if (k <= kf[i][0] || i === kf.length - 1) {
    const [t0, p0] = kf[i - 1], [t1, p1, e] = kf[i], u = EASE[e || 'io'](Math.min(1, Math.max(0, (k - t0) / (t1 - t0))));
    for (let j = 0; j < 7; j++) out[j] = p0[j] + (p1[j] - p0[j]) * u;
    return out;
  }
  return out;
}
function applyPose(p) { rig.rotation.set(p[0], p[1], p[2], 'YXZ'); rig.position.z = -0.16 + p[6]; swordG.rotation.set(p[3], p[4], p[5]); }

export function refreshWeaponLook() { if (swordBlade) swordBlade.material.color.setHex(WEAPONS[G.equip.weapon].color); }

// -------------------------------------------------------------- skills & perks
export const hasPerk = (p) => !!G.player.perks[p];
export const skill = (id) => G.player.skills[id].lvl;
export const skillXpNeeded = (lvl) => 14 + lvl * 1.6;

export function useSkill(id, amount) {
  const s = G.player.skills[id]; if (!s || s.lvl >= 100 || !(amount > 0)) return;
  s.xp += amount;
  while (s.lvl < 100 && s.xp >= skillXpNeeded(s.lvl)) {
    s.xp -= skillXpNeeded(s.lvl); s.lvl++;
    notify(`${SKILLS[id].name} increased to ${s.lvl}`, 'skill'); sfx.skill();
    addXP(5 + Math.floor(s.lvl / 4));
  }
}

export function perkState(id) {
  const p = PERKS[id], P = G.player;
  if (P.perks[id]) return 'owned';
  const preOk = !p.pre.length || p.pre.some(q => P.perks[q]);
  if (!preOk) return 'locked';
  if (skill(p.skill) < p.req) return 'needskill';
  return P.perkPts > 0 ? 'available' : 'nopoints';
}

export function unlockPerk(id) {
  const P = G.player;
  if (perkState(id) !== 'available') return false;
  P.perks[id] = true; P.perkPts--;
  const a = PERKS[id].active;
  if (a) learnAbility(a);
  sfx.level(); notify(`Perk unlocked: ${PERKS[id].name}`, 'gold');
  return true;
}

export function learnAbility(id) {
  const P = G.player;
  P.spells[id] = true;
  if (!P.hotbar.includes(id)) { const i = P.hotbar.indexOf(null); if (i >= 0) P.hotbar[i] = id; }
}

// -------------------------------------------------------------- derived stats
export const armorType = () => ARMORS[G.equip.armor].type;
export function meleeDamage(power = false) {
  let d = WEAPONS[G.equip.weapon].dmg * (1 + skill('oneHanded') / 150);
  if (hasPerk('armsman')) d *= 1.25;
  if (G.flags.stone === 'warrior') d *= 1.2;
  if (power) d *= 2 * (hasPerk('savageStrike') ? 1.25 : 1);
  return d * (0.9 + Math.random() * 0.2);
}
export function armorRating() {
  const t = armorType();
  let a = ARMORS[G.equip.armor].armor;
  if (t === 'heavy') a *= (1 + skill('heavyArmor') / 200) * (hasPerk('juggernaut') ? 1.3 : 1);
  if (t === 'light') a *= (1 + skill('lightArmor') / 200) * (hasPerk('agileDefender') ? 1.3 : 1);
  if (G.player.stoneT > 0) a += 80;
  return Math.round(a);
}
export function spellMult(element) {
  let m = 1 + skill('destruction') / 150;
  if (element === 'fire' && hasPerk('augFlames')) m *= 1.35;
  if (element === 'frost' && hasPerk('augFrost')) m *= 1.35;
  if (element === 'shock' && hasPerk('augShock')) m *= 1.35;
  if (hasPerk('expertDest')) m *= 1.2;
  return m;
}
const restoMult = () => 1 + skill('restoration') / 200;
export function abilityCost(id) {
  const a = ABILITIES[id];
  if (a.mp) {
    let c = a.mp * (1 - skill(a.school) / 300);
    if (a.school === 'destruction') c *= (hasPerk('noviceDest') ? 0.75 : 1) * (hasPerk('expertDest') ? 0.75 : 1);
    if (a.school === 'restoration' && hasPerk('noviceResto')) c *= 0.75;
    if (G.flags.stone === 'mage') c *= 0.8;
    return { mp: Math.round(c) };
  }
  return { sp: a.sp || 0 };
}
export function maxSp() { return G.player.maxSp + (G.flags.stone === 'steed' ? 25 : 0); }
export function shoutCooldown() { return 20; }

// Detection radius for an enemy noticing the player (used by enemy AI).
export function detectRange(e) {
  const P = G.player;
  if (P.invisT > 0) return 0;
  let r = e.def.aggro;
  if (P.crouch) {
    r *= 0.42 * (1 - skill('sneak') / 220) * (hasPerk('stealth') ? 0.75 : 1);
    if (P.vel.lengthSq() > 1) r *= hasPerk('muffled') ? 1.0 : 1.45;
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
    if ((Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / d < 0) r *= 0.55; // facing away
  }
  if (daylight() < 0.3) r *= 0.75;
  return r;
}

// -------------------------------------------------------------- dealing damage
export function playerHit(e, dmg, o = {}) {
  if (!e || e.dead) return 0;
  const P = G.player;
  let m = 1;
  if (P.crouch && e.state !== 'chase' && e.type !== 'dragon') {
    m = o.melee ? (hasPerk('assassin') ? 6 : hasPerk('backstab') ? 4 : 2) : 1.5;
    notify(`Sneak attack for ${m}× damage!`, 'gold'); useSkill('sneak', 14);
  }
  if (o.melee && hasPerk('bladesman') && Math.random() < 0.15) { m *= 2; notify('Critical hit!', 'gold'); }
  if (P.invisT > 0) { P.invisT = 0; notify('Your cloak fades'); }
  dmg *= m;
  damageEnemy(e, dmg, { color: o.color });
  if (o.spell && hasPerk('impact') && e.type !== 'dragon') e.stunT = Math.max(e.stunT, 0.6);
  if (o.skill) useSkill(o.skill, dmg / (o.skill === 'destruction' ? 5 : 4) + 1);
  return dmg;
}

export function damagePlayer(amount, src, kind = 'melee') {
  const P = G.player; if (P.dead) return;
  if (P.dodgeT > 0 && kind !== 'fall') return;
  const type = armorType();
  if (kind === 'melee' && type === 'light' && hasPerk('deftMovement') && Math.random() < 0.15) { notify('Evaded!'); return; }
  if (P.blocking && P.sp > 0 && src && src.pos && kind !== 'fall') {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const dx = src.pos.x - P.pos.x, dz = src.pos.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
    if ((dx * fx + dz * fz) / d > 0.3) {
      let taken = 0.28 * (hasPerk('shieldWall') ? 0.75 : 1) * (1 - skill('block') / 250);
      if (kind === 'arrow' && hasPerk('deflectArrows')) taken = 0;
      if (kind === 'frost' && hasPerk('elementalProt')) taken *= 0.5;
      useSkill('block', amount * (1 - taken) / 3 + 1.5);
      if (kind === 'melee' && hasPerk('riposte') && !src.dead && src.def) damageEnemy(src, amount * 0.4, { color: 0xffeeaa });
      amount *= taken;
      P.sp = Math.max(0, P.sp - 12 * (1 - skill('block') / 200)); P.spUseT = 0;
      sfx.block(); burst(G.camera.position.clone().add(new THREE.Vector3(fx, -0.2, fz)), 0xffeeaa, 6, 3, 0.3, 0.06);
      if (amount <= 0) return;
    }
  }
  if (kind === 'melee' && type === 'heavy' && hasPerk('reflectBlows') && src && src.def && Math.random() < 0.15) {
    damageEnemy(src, amount, { color: 0xaaaaaa }); notify('Blow reflected!'); return;
  }
  if (kind !== 'fall') amount *= 80 / (80 + armorRating());
  if (P.wardT > 0 && kind !== 'fall') {
    const ab = Math.min(P.wardHp, amount); P.wardHp -= ab; amount -= ab;
    if (P.wardHp <= 0) { P.wardT = 0; notify('Your ward shatters'); }
    if (amount <= 0) { sfx.block(); return; }
  }
  if (type === 'light') useSkill('lightArmor', amount / 3 + 1);
  if (type === 'heavy') useSkill('heavyArmor', amount / 3 + 1);
  P.hp -= amount; P.hurtT = 0; P.shake = Math.max(P.shake || 0, Math.min(1, amount / 15)); P.hurtKick = 1;
  damageFlash(Math.min(1, amount / 25));
  sfx.hurt();
  if (P.hp < P.maxHp * 0.1 && P.hp > 0 - 999 && hasPerk('avoidDeath') && P.avoidCd <= 0) {
    P.hp = Math.min(P.maxHp, Math.max(P.hp, 0) + 150); P.avoidCd = 60;
    notify('Avoid Death!', 'gold'); sfx.heal(); burst(P.pos.clone().setY(P.pos.y + 1), 0xf0d870, 30, 4, 1, 0.1, -3);
    return;
  }
  if (P.hp <= 0) { P.hp = 0; P.dead = true; showDeath(); }
}

// -------------------------------------------------------------- melee
export function startAttack() {
  const P = G.player;
  if (P.dead || P.blocking || P.atkCd > 0) return;
  P.atkHold = 0;
}
export function releaseAttack() {
  const P = G.player;
  if (P.atkHold >= 0) { P.atkHold = -1; swing(false); }
}
function swing(power) {
  const P = G.player;
  if (P.atkCd > 0 || P.dead || P.blocking) return;
  const cost = power ? 25 * (hasPerk('fightingStance') ? 0.75 : 1) : 8;
  if (power && P.sp < cost) power = false;
  if (P.sp < 4) { notify('Too exhausted to attack', 'warn'); return; }
  P.sp -= power ? cost : 8; P.spUseT = 0;
  // light attacks chain into a 3-hit combo: slash, backhand, overhead chop
  if (!power) { P.combo = (performance.now() - (P.lastSwing || 0) < 900) ? ((P.combo || 0) + 1) % 3 : 0; P.lastSwing = performance.now(); }
  P.swingKind = power ? 'power' : ['slashA', 'slashB', 'chop'][P.combo];
  P.swingDur = power ? 0.6 : P.swingKind === 'chop' ? 0.52 : 0.44;
  P.swingT = P.swingDur; P.atkCd = power ? 0.75 : P.swingDur * 0.82;
  P.pendingHit = power ? P.swingDur * 0.26 : P.swingDur * 0.5; P.pendingPower = power;
  setTimeout(sfx.swing, power ? 60 : P.swingDur * 300);
}

function resolveMelee(power) {
  const P = G.player;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  let hitAny = false;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d > 2.6 + e.def.radius) continue;
    if (Math.abs((e.pos.y + e.def.height * 0.5) - (P.pos.y + 1.2)) > e.def.height * 0.6 + 1.6) continue;
    if (d > 0.5 && (dx * fx + dz * fz) / d < 0.45) continue;
    playerHit(e, meleeDamage(power), { melee: true, skill: 'oneHanded' });
    if (e.type !== 'dragon' && d > 0.1) {
      const k = power ? 7 : 3; e.kb.set(dx / d * k, 0, dz / d * k);
      if (power && hasPerk('savageStrike')) e.stunT = Math.max(e.stunT, 0.7);
      if (power && hasPerk('paralyzingStrike') && Math.random() < 0.25) { e.stunT = 3; notify(`${e.def.name} is paralyzed!`, 'gold'); }
    }
    hitAny = true;
  }
  if (hitAny) { sfx.hit(); G.hitStop = power ? 0.11 : 0.06; P.shake = Math.max(P.shake || 0, power ? 1 : 0.45); P.swingT += power ? 0.08 : 0.04; }
}

// -------------------------------------------------------------- abilities
function aimDir() { G.camera.getWorldDirection(F); return F; }
function rayTarget(origin, dir, maxD, exclude) {
  let best = null, bestT = maxD + 1;
  for (const e of G.enemies) {
    if (e.dead || (exclude && exclude.has(e))) continue;
    T.copy(e.pos); T.y += e.def.height * 0.55;
    const rel = T.clone().sub(origin), t = rel.dot(dir);
    if (t < 0 || t > maxD) continue;
    if (rel.addScaledVector(dir, -t).length() < e.def.radius + 1.0 && t < bestT) { best = e; bestT = t; }
  }
  return best;
}
const center = (e) => e.pos.clone().setY(e.pos.y + e.def.height * 0.55);

export function useHotbar(i) { const id = G.player.hotbar[i]; if (id) useAbility(id); }

export function useAbility(id) {
  const P = G.player, A = ABILITIES[id];
  if (P.dead || !A) return;
  if (!P.spells[id]) { notify(`You haven't learned ${A.name}`, 'warn'); return; }
  if ((P.cds[id] || 0) > 0) { notify(`${A.name} is recharging (${Math.ceil(P.cds[id])}s)`, 'warn'); return; }
  if (A.school && P.castCd > 0) return;
  const cost = abilityCost(id);
  if (cost.mp && P.mp < cost.mp) { notify('Not enough magicka', 'warn'); return; }
  if (cost.sp && P.sp < cost.sp) { notify('Not enough stamina', 'warn'); return; }
  if (cost.mp) { P.mp -= cost.mp; P.mpUseT = 0; }
  if (cost.sp) { P.sp -= cost.sp; P.spUseT = 0; }
  if (A.cd) P.cds[id] = A.cd;
  if (A.school) { P.castCd = 0.45; P.castT = 0.35; }
  const cam = G.camera, dir = aimDir().clone();
  const origin = cam.position.clone().addScaledVector(dir, 0.8); origin.y -= 0.15;
  const setHand = (c) => viewHand.material.color.setHex(c);

  switch (id) {
    case 'firebolt':
      setHand(0xff8a2a);
      spawnProjectile({ kind: 'fire', pos: origin, dir, speed: 34, owner: 'player', dmg: 22 * spellMult('fire'), life: 2.5, size: 0.28 });
      sfx.fire(); break;
    case 'fireball':
      setHand(0xff6a1a);
      spawnProjectile({ kind: 'fire', big: true, pos: origin, dir, speed: 26, owner: 'player', dmg: 42 * spellMult('fire'), life: 3, size: 0.55 });
      sfx.fire(); break;
    case 'frost': {
      setHand(0x9fe4ff);
      const r = 8 * (hasPerk('augFrost') ? 1.25 : 1);
      ring(P.pos, 0xbfeaff, r, 0.5);
      burst(P.pos.clone().setY(P.pos.y + 0.2), 0xd8f4ff, 40, 12, 0.6, 0.09, 2);
      for (const e of G.enemies) {
        if (e.dead) continue;
        const dist = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) - e.def.radius;
        if (dist < r && Math.abs(e.pos.y - P.pos.y) < 6) {
          playerHit(e, 16 * spellMult('frost'), { color: 0xbfeaff, skill: 'destruction', spell: true });
          e.slowT = hasPerk('augFrost') ? 7 : 4;
          if (hasPerk('deepFreeze') && e.type !== 'dragon' && Math.random() < 0.25) { e.stunT = 2.5; burst(center(e), 0xffffff, 16, 2, 0.8, 0.15, 0); }
        }
      }
      sfx.frost(); flash(P.pos.clone().setY(P.pos.y + 1), 0x88ccff, 5, 0.4); break;
    }
    case 'lightning': {
      setHand(0xbfe6ff);
      const best = rayTarget(cam.position, dir, 45);
      const end = best ? center(best) : groundHit(cam.position, dir, 45);
      if (best) playerHit(best, 30 * spellMult('shock'), { color: 0xbfe6ff, skill: 'destruction', spell: true });
      bolt(origin, end); sfx.zap(); break;
    }
    case 'chain': {
      setHand(0xbfe6ff);
      let cur = rayTarget(cam.position, dir, 45); let from = origin; const hit = new Set();
      if (!cur) { bolt(origin, groundHit(cam.position, dir, 45)); sfx.zap(); break; }
      for (let n = 0; n < 4 && cur; n++) {
        hit.add(cur); const c = center(cur);
        bolt(from, c, 0xd8e8ff);
        playerHit(cur, 26 * spellMult('shock'), { color: 0xbfe6ff, skill: 'destruction', spell: true });
        from = c;
        let next = null, nd = 12;
        for (const e of G.enemies) { if (e.dead || hit.has(e)) continue; const d = e.pos.distanceTo(cur.pos); if (d < nd) { nd = d; next = e; } }
        cur = next;
      }
      sfx.zap(); break;
    }
    case 'heal': case 'grandHeal': {
      setHand(0x8aff8a);
      const amt = (id === 'heal' ? 45 : 150) * restoMult() * (hasPerk('regeneration') ? 1.5 : 1);
      const healed = Math.min(P.maxHp - P.hp, amt);
      P.hp += healed;
      if (hasPerk('respite')) P.sp = Math.min(maxSp(), P.sp + amt * 0.5);
      useSkill('restoration', healed / 5 + 1);
      burst(P.pos.clone().setY(P.pos.y + 1), 0x8aff8a, id === 'heal' ? 24 : 50, 3, 0.9, 0.1, -3);
      sfx.heal(); break;
    }
    case 'ward':
      setHand(0xf0d870);
      P.wardT = 10; P.wardHp = 70 * restoMult();
      useSkill('restoration', 6); sfx.heal(); flash(P.pos.clone().setY(P.pos.y + 1.5), 0xf0d870, 4, 0.5);
      notify('Ward raised'); break;
    case 'turnUndead': {
      setHand(0xfff0a0);
      ring(P.pos, 0xfff0a0, 14, 0.6); sfx.heal(); flash(P.pos.clone().setY(P.pos.y + 1), 0xfff0a0, 6, 0.5);
      for (const e of G.enemies) {
        if (e.dead || !['draugr', 'lord'].includes(e.type)) continue;
        if (e.pos.distanceTo(P.pos) > 14) continue;
        playerHit(e, 35 * restoMult(), { color: 0xfff0a0, skill: 'restoration' });
        e.fleeT = e.def.boss ? 3 : 6;
      }
      break;
    }
    case 'whirlwind': {
      P.swingT = P.swingDur = 0.55; P.swingKind = 'spin'; P.spinT = 0.55; sfx.swing(); setTimeout(sfx.swing, 160);
      let any = false;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > 3.6 + e.def.radius || Math.abs(e.pos.y - P.pos.y) > 3) continue;
        playerHit(e, meleeDamage() * 1.5, { melee: true, skill: 'oneHanded' });
        if (e.type !== 'dragon' && d > 0.1) e.kb.set(dx / d * 6, 0, dz / d * 6);
        any = true;
      }
      ring(P.pos, 0xffffff, 4, 0.35);
      if (any) sfx.hit(); break;
    }
    case 'shieldBash': {
      P.swingT = P.swingDur = 0.35; P.swingKind = 'bash'; sfx.block(); P.shake = 0.4;
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      for (const e of G.enemies) {
        if (e.dead || e.type === 'dragon') continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > 3.2 + e.def.radius || (d > 0.5 && (dx * fx + dz * fz) / d < 0.4)) continue;
        playerHit(e, 8 + skill('block') / 4, { melee: true });
        e.kb.set(dx / (d || 1) * 11, 0, dz / (d || 1) * 11); e.stunT = Math.max(e.stunT, 1.3);
        useSkill('block', 5);
      }
      break;
    }
    case 'stoneskin':
      P.stoneT = 15; sfx.block(); burst(P.pos.clone().setY(P.pos.y + 1), 0xaab4c0, 30, 3, 0.8, 0.12, 0);
      if (armorType() === 'heavy') useSkill('heavyArmor', 6);
      notify('Iron Will: +80 armor'); break;
    case 'dodge': {
      const K = G.keys, f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), r = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
      const d = new THREE.Vector3();
      if (K.KeyW) d.add(f); if (K.KeyS) d.sub(f); if (K.KeyD) d.add(r); if (K.KeyA) d.sub(r);
      if (d.lengthSq() === 0) d.copy(f).negate();
      P.dodgeDir.copy(d.normalize()); P.dodgeT = 0.35;
      if (armorType() === 'light') useSkill('lightArmor', 2);
      sfx.swing(); break;
    }
    case 'vanish':
      P.invisT = 8; P.crouch = true;
      for (const e of G.enemies) if (!e.dead && e.state === 'chase' && e.type !== 'dragon') { e.state = 'idle'; e.wander = null; }
      useSkill('sneak', 8); sfx.frost(); notify('You fade into the shadows'); break;
    case 'intimidate': {
      sfx.roar(); wave(cam.position.clone().addScaledVector(dir, 1), dir.clone(), 0xc08ad8);
      let n = 0;
      for (const e of G.enemies) {
        if (e.dead || e.def.boss || e.pos.distanceTo(P.pos) > 15) continue;
        e.fleeT = 6; e.state = 'chase'; n++;
      }
      useSkill('speech', 4 + n * 3);
      notify(n ? `${n} ${n === 1 ? 'enemy flees' : 'enemies flee'} in terror` : 'Nothing here fears you'); break;
    }
  }
}

function groundHit(origin, dir, maxD) {
  for (let t = 1; t < maxD; t += 1) { T.copy(origin).addScaledVector(dir, t); if (T.y < ground(T.x, T.z)) return T.clone(); }
  return origin.clone().addScaledVector(dir, maxD);
}

export function shout() {
  const P = G.player;
  if (P.dead) return;
  if (!G.flags.shout) { notify('You do not know any Words of Power', 'warn'); return; }
  if (P.shoutCd > 0) { notify(`Your Voice needs ${Math.ceil(P.shoutCd)}s to recover`, 'warn'); return; }
  P.shoutCd = shoutCooldown();
  const cam = G.camera, dir = aimDir();
  const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  wave(cam.position.clone().addScaledVector(dir, 1), dir.clone());
  sfx.shout(); flash(cam.position.clone().addScaledVector(dir, 3), 0xcfe8ff, 4, 0.4);
  notify('FUS RO DAH!', 'shout');
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    const isDragon = e.type === 'dragon';
    if (d > (isDragon ? 60 : 16) + e.def.radius) continue;
    if (d > 1 && (dx * flat.x + dz * flat.z) / d < (isDragon ? 0.6 : 0.5)) continue;
    if (isDragon) { forceDragonLand(e); damageEnemy(e, 40, { color: 0xcfe8ff }); continue; }
    damageEnemy(e, 30, { color: 0xcfe8ff });
    e.kb.set(dx / (d || 1) * 22, 0, dz / (d || 1) * 22); e.stunT = 2;
  }
}

export function toggleCrouch() {
  const P = G.player; if (P.dead || P.swimming) return;
  P.crouch = !P.crouch;
  if (P.crouch && hasPerk('shadowWarrior') && P.shadowCd <= 0) {
    let n = 0;
    for (const e of G.enemies) if (!e.dead && e.state === 'chase' && e.type !== 'dragon' && e.pos.distanceTo(P.pos) < 30) { e.state = 'idle'; e.wander = null; n++; }
    if (n) { P.shadowCd = 20; notify('Shadow Warrior: they lose sight of you', 'gold'); }
  }
}

export function drinkPotion(id) {
  const P = G.player;
  if (!G.inv[id]) { notify(`No ${id === 'healthPotion' ? 'health' : id === 'magickaPotion' ? 'magicka' : 'stamina'} potions`, 'warn'); return false; }
  G.inv[id]--;
  if (id === 'healthPotion') P.hp = Math.min(P.maxHp, P.hp + 60);
  if (id === 'magickaPotion') P.mp = Math.min(P.maxMp, P.mp + 60);
  if (id === 'staminaPotion') P.sp = maxSp();
  sfx.pickup(); notify(`Drank ${id === 'healthPotion' ? 'Health' : id === 'magickaPotion' ? 'Magicka' : 'Stamina'} Potion`);
  return true;
}

// -------------------------------------------------------------- per-frame update
export function updatePlayer(dt) {
  const P = G.player, K = G.keys, cam = G.camera;
  P.atkCd -= dt; P.castCd -= dt; P.shoutCd = Math.max(0, P.shoutCd - dt); P.hurtT += dt; P.spUseT += dt; P.mpUseT += dt;
  P.avoidCd -= dt; P.shadowCd -= dt; P.wardT = Math.max(0, P.wardT - dt); P.stoneT = Math.max(0, P.stoneT - dt);
  P.invisT = Math.max(0, P.invisT - dt); P.dodgeT = Math.max(0, P.dodgeT - dt);
  for (const k in P.cds) P.cds[k] = Math.max(0, P.cds[k] - dt);
  const type = armorType();
  if (!P.dead) {
    F.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); R.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const mv = new THREE.Vector3();
    if (K.KeyW) mv.add(F); if (K.KeyS) mv.sub(F); if (K.KeyD) mv.add(R); if (K.KeyA) mv.sub(R);
    const moving = mv.lengthSq() > 0;
    P.blocking = G.mouse.right && P.sp > 0 && P.swingT <= 0;
    let speed = 6 * (G.flags.stone === 'steed' ? 1.15 : 1);
    if (type === 'heavy' && !hasPerk('conditioning')) speed *= 0.88;
    const sprinting = K.ShiftLeft && moving && P.sp > 1 && !P.blocking && K.KeyW;
    if (sprinting) {
      P.crouch = false; speed *= 1.75;
      P.sp -= 18 * (type === 'light' && hasPerk('windWalker') ? 0.6 : 1) * dt; P.spUseT = 0;
    }
    if (P.crouch) speed *= 0.55;
    if (P.blocking && !hasPerk('blockRunner')) speed *= 0.5;
    const gy = ground(P.pos.x, P.pos.z);
    P.swimming = gy < WATER - 1.3;
    if (P.swimming) { speed *= 0.55; P.crouch = false; }
    if (moving) mv.normalize().multiplyScalar(speed);
    if (P.dodgeT > 0) mv.copy(P.dodgeDir).multiplyScalar(17);
    const acc = P.dodgeT > 0 ? 30 : P.onGround || P.swimming ? 12 : 3;
    P.vel.x += (mv.x - P.vel.x) * Math.min(1, acc * dt); P.vel.z += (mv.z - P.vel.z) * Math.min(1, acc * dt);
    P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
    resolveCollision(P.pos, 0.45);
    if (K.Space && P.onGround && !P.swimming && P.sp > 5) { P.vy = 7.2; P.onGround = false; P.sp -= 5; P.spUseT = 0; K.Space = false; P.crouch = false; }
    P.vy -= 22 * dt; P.pos.y += P.vy * dt;
    const floor = P.swimming ? WATER - 1.35 : ground(P.pos.x, P.pos.z);
    if (P.pos.y <= floor) { if (!P.onGround && P.vy < -16) damagePlayer((-P.vy - 16) * 4, null, 'fall'); P.pos.y = floor; P.vy = 0; P.onGround = true; }
    else if (P.onGround && P.vy <= 0 && P.pos.y - floor < 0.9) { P.pos.y = floor; P.vy = 0; }
    else P.onGround = false;
    if (moving && P.onGround) { P.stepT -= dt * (sprinting ? 1.6 : P.crouch ? 0.6 : 1); if (P.stepT <= 0) { if (!P.crouch) sfx.step(); P.stepT = 0.42; } }
    // regen
    if (P.spUseT > 1) P.sp = Math.min(maxSp(), P.sp + 16 * (type === 'light' && hasPerk('windWalker') ? 1.5 : 1) * dt);
    if (P.mpUseT > 1.2) P.mp = Math.min(P.maxMp, P.mp + 4.5 * (hasPerk('recovery') ? 1.5 : 1) * dt);
    P.hp = Math.min(P.maxHp, P.hp + (P.hurtT > 6 ? 2.5 : 0.4) * dt);
    P.sp = clamp(P.sp, 0, maxSp());
    // power attack: hold the mouse button
    if (P.atkHold >= 0) { P.atkHold += dt; if (P.atkHold > 0.4) { P.atkHold = -1; swing(true); } }
    if (P.pendingHit > 0) { P.pendingHit -= dt; if (P.pendingHit <= 0) resolveMelee(P.pendingPower); }
    // sneak practice: crouching near enemies that haven't noticed you
    if (P.crouch) {
      P.sneakT += dt;
      if (P.sneakT > 1) {
        P.sneakT = 0;
        if (G.enemies.some(e => !e.dead && e.state !== 'chase' && e.pos.distanceTo(P.pos) < 22)) useSkill('sneak', 1.6);
      }
    }
  }
  // camera: bob, shake, hurt kick, whirlwind spin
  const speed = Math.hypot(P.vel.x, P.vel.z), walking = P.onGround && speed > 2;
  P.bobT = (P.bobT || 0) + dt * speed * (P.crouch ? 1.1 : 1.6);
  const bob = walking ? Math.sin(P.bobT) * 0.045 * Math.min(1, speed / 6) : 0, bobX = walking ? Math.cos(P.bobT * 0.5) * 0.03 * Math.min(1, speed / 6) : 0;
  P.eye = (P.eye ?? 1.7) + ((P.dead ? 0.4 : P.crouch ? 1.05 : 1.7) - (P.eye ?? 1.7)) * Math.min(1, dt * 10);
  P.shake = Math.max(0, (P.shake || 0) - dt * 3.5); P.hurtKick = Math.max(0, (P.hurtKick || 0) - dt * 5);
  P.spinT = Math.max(0, (P.spinT || 0) - dt);
  const sh = P.shake * P.shake * 0.035, spin = P.spinT > 0 ? EASE.io(1 - P.spinT / 0.55) * Math.PI * 2 : 0;
  cam.position.set(P.pos.x + bobX * Math.cos(P.yaw), P.pos.y + P.eye + bob, P.pos.z - bobX * Math.sin(P.yaw));
  const swingRoll = P.swingT > 0 && P.swingKind.startsWith('slash') ? Math.sin((1 - P.swingT / P.swingDur) * Math.PI) * (P.swingKind === 'slashA' ? 0.035 : -0.035) : 0;
  const chopDip = P.swingT > 0 && (P.swingKind === 'chop' || P.swingKind === 'power') ? Math.sin((1 - P.swingT / P.swingDur) * Math.PI) * -0.04 : 0;
  cam.rotation.set(P.pitch + (Math.random() - 0.5) * sh + P.hurtKick * 0.05 + chopDip, P.yaw + spin + (Math.random() - 0.5) * sh, (P.dead ? 0.6 : 0) + swingRoll + (Math.random() - 0.5) * sh * 0.5 - bobX * 0.15, 'YXZ');
  // view model: keyframed swings, smooth blending into block / charge / idle, weapon sway from mouse movement
  P.swingT = Math.max(0, P.swingT - dt); P.castT = Math.max(0, P.castT - dt);
  if (rig) {
    const target = P.blocking ? POSES.block : P.atkHold > 0.08 ? POSES.charge : POSES.idle;
    if (P.swingT > 0) sampleSwing(P.swingKind, 1 - P.swingT / P.swingDur, cur);
    else {
      const k = Math.min(1, dt * (P.atkHold > 0.08 ? 7 : 12));
      const chargeK = P.atkHold > 0.08 ? Math.min(1, P.atkHold / 0.4) : 1;
      for (let j = 0; j < 7; j++) cur[j] += (target[j] - cur[j]) * k * chargeK;
    }
    G.swayX = (G.swayX || 0) * Math.exp(-dt * 10); G.swayY = (G.swayY || 0) * Math.exp(-dt * 10);
    const tremble = P.atkHold > 0.3 ? (Math.random() - 0.5) * 0.01 : 0;
    applyPose(cur);
    rig.rotation.y += clamp(-G.swayX * 0.0025, -0.12, 0.12) + bobX * 0.4;
    rig.rotation.x += clamp(-G.swayY * 0.0025, -0.1, 0.1) + tremble;
    rig.position.x = 0.3 + bobX * 0.5; rig.position.y = -0.38 + bob * 0.5 - (P.crouch ? 0.02 : 0);
    viewHand.material.opacity = P.castT > 0 ? P.castT / 0.35 : 0;
    viewHand.position.z = -0.62 - (P.castT > 0 ? Math.sin(P.castT / 0.35 * Math.PI) * 0.12 : 0);
    if (P.castT > 0) { rig.rotation.x -= Math.sin(P.castT / 0.35 * Math.PI) * 0.12; }
    rig.visible = !P.dead; viewSword = rig;
  }
  P.vel.y = 0;
}
