import * as THREE from 'three';
import { G } from './state.js';
import { buildWorld, updateWorld, ground } from './world.js';
import { initFx, updateFx, burst, flash } from './fx.js';
import { createNPCs, updateNPCs, updateEnemies, damageEnemy } from './entities.js';
import { newPlayer, buildViewModel, updatePlayer, startAttack, releaseAttack, useHotbar, shout, drinkPotion, damagePlayer, playerHit, toggleCrouch } from './player.js';
import { findInteractable, updateDiscovery, tickAutosave, save } from './logic.js';
import { initUI, updateHUD, setPrompt, renderTitle, renderPause, openJournal, closeUI, lockPointer, chooseOption, notify } from './ui.js';
import { sfx } from './audio.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------- renderer & scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const LOW = /quality=low/.test(location.search);
renderer.setPixelRatio(LOW ? 0.75 : Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !LOW; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.72;
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 480);
scene.add(camera);
Object.assign(G, { renderer, scene, camera, low: LOW });
// post-processing: subtle bloom on fire, magic and lit windows
let composer = null;
if (!LOW) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.45, 2.2));
  composer.addPass(new OutputPass());
}

const loading = document.getElementById('loading');
setTimeout(() => {
  buildWorld(scene);
  initFx(scene);
  createNPCs();
  buildViewModel(camera);
  G.player = newPlayer();
  initUI();
  loading.remove();
  renderTitle();
  requestAnimationFrame(frame);
}, 30);

// ---------------------------------------------------------------- projectile hooks
const C = new THREE.Vector3();
const hooks = {
  testHit(p) {
    if (p.owner === 'player') {
      for (const e of G.enemies) {
        if (e.dead) continue;
        C.copy(e.pos); C.y += e.def.height * 0.55;
        if (C.distanceTo(p.mesh.position) < e.def.radius + (p.size ?? 0.3) + 0.35) return e;
      }
    } else {
      const P = G.player; if (P.dead) return null;
      C.copy(P.pos); C.y += 1.0;
      if (Math.abs(p.mesh.position.y - C.y) < 1.1 && Math.hypot(p.mesh.position.x - C.x, p.mesh.position.z - C.z) < 0.7 + (p.size ?? 0)) return 'player';
    }
    return null;
  },
  onImpact(p, hit) {
    const pos = p.mesh.position;
    if (p.kind === 'fire') {
      const big = !!p.big, R = big ? 6.5 : 3;
      burst(pos, 0xff8a2a, big ? 60 : 22, big ? 12 : 7, 0.7, big ? 0.3 : 0.2, 3); burst(pos, 0xffd04a, 10, 4, 0.4, 0.15, 0);
      flash(pos, 0xff7a2a, big ? 10 : 6, big ? 0.6 : 0.35); sfx.boom();
      const o = { color: 0xff8a2a, skill: 'destruction', spell: true };
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (e === hit) { playerHit(e, p.dmg, o); e.burnT = 3; continue; }
        C.copy(e.pos); C.y += e.def.height * 0.5;
        if (C.distanceTo(pos) < R + e.def.radius) { playerHit(e, p.dmg * (big ? 0.8 : 0.4), o); if (big) e.burnT = 3; }
      }
    } else if (p.kind === 'arrow') {
      if (hit === 'player') damagePlayer(p.dmg, p.src, 'arrow'); else burst(pos, 0x8a6a4a, 4, 2, 0.3, 0.06);
    } else if (p.kind === 'frost') {
      burst(pos, 0xd8f4ff, 8, 4, 0.4, 0.12, 2);
      if (hit === 'player') damagePlayer(p.dmg, p.src, 'frost');
    }
  },
};

// ---------------------------------------------------------------- input
const canvas = renderer.domElement;
const SENS = 0.0022;
addEventListener('keydown', (e) => {
  if (e.code === 'F5' || e.code === 'Tab' || e.code === 'F9') e.preventDefault();
  if (G.ui) {
    if (G.ui === 'dialogue' && /^Digit[1-9]$/.test(e.code)) { chooseOption(+e.code.slice(5) - 1); return; }
    if (e.code === 'Escape' && ['journal', 'dialogue', 'shop', 'victory', 'pause'].includes(G.ui)) { closeUI(); return; }
    if (G.ui === 'journal' || G.ui === 'shop') {
      const tab = { KeyI: 'inventory', Tab: 'inventory', KeyJ: 'quests', KeyK: 'skills', KeyP: 'magic', KeyM: 'map' }[e.code];
      if (tab && G.ui === 'journal') openJournal(tab);
      else if (tab) closeUI();
    }
    return;
  }
  if (!G.running) return;
  G.keys[e.code] = true;
  const P = G.player; if (P.dead) return;
  switch (e.code) {
    case 'KeyE': if (G.interact) { G.interact.act(); } break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8':
      useHotbar(+e.code.slice(5) - 1); break;
    case 'KeyC': case 'ControlLeft': toggleCrouch(); break;
    case 'KeyP': openJournal('magic'); break;
    case 'KeyZ': shout(); break;
    case 'KeyQ': drinkPotion('healthPotion'); break;
    case 'KeyR': drinkPotion('magickaPotion'); break;
    case 'KeyI': case 'Tab': openJournal('inventory'); break;
    case 'KeyJ': openJournal('quests'); break;
    case 'KeyK': openJournal('skills'); break;
    case 'KeyM': openJournal('map'); break;
    case 'F5': save(); break;
  }
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
addEventListener('blur', () => { for (const k in G.keys) G.keys[k] = false; G.mouse.left = G.mouse.right = false; });
canvas.addEventListener('mousedown', (e) => {
  if (!G.running || G.ui) return;
  if (!G.locked) { lockPointer(); return; }
  if (e.button === 0) { G.mouse.left = true; startAttack(); }
  if (e.button === 2) G.mouse.right = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) { G.mouse.left = false; if (G.running && !G.ui) releaseAttack(); } if (e.button === 2) G.mouse.right = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!G.locked || G.ui) return;
  const P = G.player;
  P.yaw -= e.movementX * SENS;
  G.swayX = (G.swayX || 0) + e.movementX; G.swayY = (G.swayY || 0) + e.movementY;
  P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - e.movementY * SENS));
});
document.addEventListener('pointerlockchange', () => {
  G.locked = document.pointerLockElement === canvas;
  if (G.locked) document.getElementById('click-to-play').classList.add('hidden');
  if (!G.locked && G.running && !G.ui && !G.player.dead) renderPause();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
const titleCam = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  if (window.__pause) return;
  stepOnce(Math.min(clock.getDelta(), 0.05));
}
function stepOnce(dt, render = true) {
  if (G.running && !G.ui) {
    G.time = (G.time + dt * 24 / (16 * 60)) % 24;      // one in-game day = 16 real minutes
    for (const c of camera.children) c.visible = true;
    updatePlayer(dt);
    // hit-stop: freeze the world for a split second when a blow lands
    let wdt = dt;
    if (G.hitStop > 0) { G.hitStop -= dt; wdt = dt * 0.06; }
    updateEnemies(wdt);
    updateNPCs(dt);
    updateFx(wdt, hooks);
    updateDiscovery();
    tickAutosave(dt);
    G.interact = G.player.dead ? null : findInteractable();
    setPrompt(G.interact ? G.interact.label : '');
    updateHUD(dt);
    updateWorld(dt, G.player.pos);
  } else if (!G.running) {
    const t = performance.now() * 0.00004;
    titleCam.set(Math.cos(t) * 75, 0, Math.sin(t) * 75);
    titleCam.y = Math.max(ground(titleCam.x, titleCam.z), 0) + 26;
    camera.position.copy(titleCam); camera.lookAt(0, 6, 0);
    for (const c of camera.children) c.visible = false;
    updateWorld(dt, titleCam);
  } else {
    updateWorld(0, G.player.pos);
  }
  if (!render) return;
  if (composer) composer.render(); else renderer.render(scene, camera);
}

// handle for tinkering from the browser console
window.__G = G;
import * as PL from './player.js';
import * as LG from './logic.js';
import * as UIm from './ui.js';
import * as EN from './entities.js';
window.__mods = { PL, LG, UI: UIm, EN };
// test hook: advance the simulation n frames and render once (used for automated screenshots)
window.__step = (n = 1, dt = 0.05, render = true) => { for (let i = 0; i < n; i++) stepOnce(dt, render && i === n - 1); return render ? renderer.domElement.toDataURL('image/png') : null; };
