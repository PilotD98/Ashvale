import { G } from './state.js';
import { ITEMS, WEAPONS, ARMORS, ABILITIES, PERKS, SKILLS, STONES, QUESTS, LOCATIONS, xpForLevel } from './data.js';
import { questText, questTargets, SHOP_STOCK, buy, sell, buyPerk, raiseAttr, save, load, hasSave, newGame, giveWeapon, giveArmor, buyPrice, sellPrice, entryBase } from './logic.js';
import { drinkPotion, armorRating, abilityCost, maxSp, shoutCooldown, refreshWeaponLook, skill, skillXpNeeded, perkState, armorType } from './player.js';
import { renderMapImage } from './world.js';
import { sfx, initAudio } from './audio.js';
import { wrapAngle } from './util.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let mapImg = null, journalTab = 'quests', dialogueNode = null, selSkill = 'oneHanded', selPerk = null;

// ---------------------------------------------------------------- pointer lock / UI state
export function lockPointer() {
  const c = G.renderer.domElement;
  try {
    const p = c.requestPointerLock();
    if (p && p.catch) p.catch(() => $('click-to-play').classList.remove('hidden'));
  } catch { $('click-to-play').classList.remove('hidden'); }
}
export function openUI(name) {
  G.ui = name;
  if (document.pointerLockElement) document.exitPointerLock();
  for (const k in G.keys) G.keys[k] = false;
  G.mouse.left = G.mouse.right = false;
  $('click-to-play').classList.add('hidden');
}
export function closeUI() {
  G.ui = null; $('panel').classList.add('hidden'); $('panel').innerHTML = '';
  lockPointer();
}

// ---------------------------------------------------------------- notifications
export function notify(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'notif ' + kind; el.textContent = msg;
  const box = $('notifs'); box.appendChild(el);
  while (box.children.length > 6) box.removeChild(box.firstChild);
  setTimeout(() => el.classList.add('fade'), 3500);
  setTimeout(() => el.remove(), 4200);
}
let bannerTimer = 0;
export function banner(title, sub = '') {
  const b = $('banner'); b.querySelector('.t').textContent = title; b.querySelector('.s').textContent = sub;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 3600);
}
export function damageFlash(k) { const d = $('damage-flash'); d.style.opacity = Math.max(+d.style.opacity || 0, 0.25 + k * 0.5); }

// ---------------------------------------------------------------- HUD
const last = {};
function setW(id, frac) { const v = Math.max(0, Math.min(1, frac)); if (last[id] !== v) { last[id] = v; $(id).style.width = (v * 100).toFixed(1) + '%'; } }
function setT(id, text) { if (last['t' + id] !== text) { last['t' + id] = text; $(id).innerHTML = text; } }
let compassT = 0;

export function updateHUD(dt) {
  const P = G.player;
  setW('hp-fill', P.hp / P.maxHp); setW('mp-fill', P.mp / P.maxMp); setW('sp-fill', P.sp / maxSp());
  setW('xp-fill', P.xp / xpForLevel(P.level));
  setT('level', `Lv ${P.level}${P.perkPts || P.attrPts ? ' <b>+</b>' : ''}`);
  const d = $('damage-flash'); if (+d.style.opacity > 0) d.style.opacity = Math.max(0, +d.style.opacity - dt * 1.5);
  const lowHp = P.hp / P.maxHp < 0.25; if (last.low !== lowHp) { last.low = lowHp; $('hud').classList.toggle('lowhp', lowHp); }

  // target / boss bar
  G.targetT -= dt;
  const t = G.target;
  if (t && G.targetT > 0 && !t.dead) {
    $('target').classList.add('show'); setT('target-name', esc(t.def.name) + (t.def.boss ? ' ☠' : ''));
    setW('target-fill', t.hp / t.maxHp);
  } else $('target').classList.remove('show');

  // hotbar
  let ab = '';
  P.hotbar.forEach((id, i) => {
    if (!id) { ab += `<div class="ab empty"><span class="k">${i + 1}</span></div>`; return; }
    const A = ABILITIES[id], c = abilityCost(id), cd = P.cds[id] || 0;
    const short = (c.mp && P.mp < c.mp) || (c.sp && P.sp < c.sp);
    ab += `<div class="ab ${A.school ? 'spell' : 'power'} ${short ? 'nomana' : ''}" title="${esc(A.name)}"><span class="k">${i + 1}</span><span class="i">${A.icon}</span>${c.mp ? `<span class="c">${c.mp}</span>` : c.sp ? `<span class="c st">${c.sp}</span>` : ''}${cd > 0 ? `<div class="cd" style="height:${Math.min(1, cd / A.cd) * 100}%"></div>` : ''}</div>`;
  });
  const scd = P.shoutCd / shoutCooldown();
  ab += `<div class="ab shout ${G.flags.shout ? '' : 'locked'}"><span class="k">Z</span><span class="i">${G.flags.shout ? '◎' : '🔒'}</span>${G.flags.shout && P.shoutCd > 0 ? `<div class="cd" style="height:${scd * 100}%"></div>` : ''}</div>`;
  ab += `<div class="ab pot"><span class="k">Q</span><span class="i" style="color:#e55">⚱</span><span class="c">${G.inv.healthPotion || 0}</span></div>`;
  ab += `<div class="ab pot"><span class="k">R</span><span class="i" style="color:#59f">⚱</span><span class="c">${G.inv.magickaPotion || 0}</span></div>`;
  setT('abilities', ab);

  // status: sneak eye + buffs
  let st = '';
  if (P.crouch) {
    const seen = G.enemies.some(e => !e.dead && e.state === 'chase' && e.pos.distanceTo(P.pos) < 45);
    st += `<div class="eye ${seen ? 'seen' : ''}">${seen ? '◉ DETECTED' : '◌ HIDDEN'}</div>`;
  }
  if (P.invisT > 0) st += `<span class="buff">◐ Cloak ${Math.ceil(P.invisT)}s</span>`;
  if (P.wardT > 0) st += `<span class="buff">⛨ Ward ${Math.ceil(P.wardHp)}</span>`;
  if (P.stoneT > 0) st += `<span class="buff">🛡 Iron Will ${Math.ceil(P.stoneT)}s</span>`;
  setT('status', st);
  const inv = P.invisT > 0; if (last.inv !== inv) { last.inv = inv; $('hud').classList.toggle('invis', inv); }

  // quest tracker
  let qt = '';
  const ids = Object.keys(G.quests).filter(id => !G.quests[id].done).sort((a, b) => (b === 'main') - (a === 'main')).slice(0, 3);
  for (const id of ids) qt += `<div class="qt ${id === 'main' ? 'main' : ''}"><div class="qn">${esc(QUESTS[id].title)}</div><div class="qo">◇ ${esc(questText(id))}</div></div>`;
  setT('quest-tracker', qt);

  // clock
  const h = Math.floor(G.time), m = Math.floor((G.time % 1) * 60);
  setT('clock', `${h >= 6 && h < 19 ? '☀' : '☾'} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} &nbsp; <span class="gold">◉ ${G.gold}</span>`);

  compassT -= dt;
  if (compassT <= 0) { compassT = 0.05; drawCompass(); }
}

function drawCompass() {
  const P = G.player, heading = -P.yaw;
  let html = '';
  const place = (bearing, inner, cls) => {
    const rel = wrapAngle(bearing - heading);
    if (Math.abs(rel) > Math.PI / 2) return;
    html += `<div class="cm ${cls}" style="left:${50 + rel / (Math.PI / 2) * 50}%">${inner}</div>`;
  };
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  dirs.forEach((d, i) => place(i * Math.PI / 4, d, d.length === 1 ? 'card' : 'sub'));
  for (const k in LOCATIONS) {
    const L = LOCATIONS[k], dx = L.x - P.pos.x, dz = L.z - P.pos.z, dist = Math.hypot(dx, dz);
    if (dist < 8) continue;
    if (G.flags.discovered[k] ? dist < 260 : dist < 110) place(Math.atan2(dx, -dz), L.icon, G.flags.discovered[k] ? 'loc' : 'loc undisc');
  }
  for (const q of questTargets()) {
    const dx = q.x - P.pos.x, dz = q.z - P.pos.z;
    if (Math.hypot(dx, dz) < 4) continue;
    place(Math.atan2(dx, -dz), '▼', 'quest');
  }
  for (const e of G.enemies) {
    if (e.dead || e.state !== 'chase') continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
    if (Math.hypot(dx, dz) < 60) place(Math.atan2(dx, -dz), '•', 'enemy');
  }
  $('compass-strip').innerHTML = html;
}

export function setPrompt(text) { setT('prompt', text ? `<span class="key">E</span> ${esc(text)}` : ''); $('prompt').style.opacity = text ? 1 : 0; }

// ---------------------------------------------------------------- panels
function showPanel(html, cls = '') {
  const p = $('panel'); p.className = cls; p.innerHTML = html;
  p.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); sfx.ui(); handlers[b.dataset.act]?.(b.dataset.arg, b); }));
}
const handlers = {
  tab: (t) => { journalTab = t; renderJournal(); },
  close: () => closeUI(),
  use: (id) => { drinkPotion(id); renderJournal(); },
  eqw: (id) => { G.equip.weapon = id; refreshWeaponLook(); renderJournal(); },
  eqa: (id) => { G.equip.armor = id; renderJournal(); },
  perk: (id) => buyPerk(id),
  selskill: (id) => { selSkill = id; selPerk = null; renderJournal(); },
  selperk: (id) => { selPerk = id; renderJournal(); },
  assign: (arg) => { const [id, slot] = arg.split(':'); const hb = G.player.hotbar; const old = hb.indexOf(id); if (old >= 0) hb[old] = null; hb[+slot] = id; renderJournal(); },
  unassign: (slot) => { G.player.hotbar[+slot] = null; renderJournal(); },
  attr: (a) => raiseAttr(a),
  buy: (i) => buy(SHOP_STOCK[+i]),
  sell: (id) => sell(id),
  opt: (i) => chooseOption(+i),
  resume: () => closeUI(),
  save: () => { save(); renderPause(); },
  load: () => { if (load()) { closeUI(); notify('Game loaded'); } },
  newgame: () => { newGame(); closeUI(); banner('Ashvale', 'Speak with Elder Maren'); },
  controls: () => renderControls(G.ui),
  back: (to) => { if (to === 'title') renderTitle(); else renderPause(); },
  title: () => { save(true); G.running = false; renderTitle(); },
  start: () => { initAudio(); $('hud').classList.remove('hidden'); G.running = true; newGame(); closeUI(); banner('Ashvale', 'Speak with Elder Maren'); },
  continue: () => { initAudio(); $('hud').classList.remove('hidden'); G.running = true; if (load()) { closeUI(); notify('Welcome back'); } },
  victoryok: () => closeUI(),
  gfx: () => { location.search = G.low ? '' : '?quality=low'; },
};

export function refreshPanel() {
  if (G.ui === 'journal') renderJournal();
  if (G.ui === 'shop') renderShop();
}

export function openJournal(tab) {
  if (G.ui === 'journal' && journalTab === tab) { closeUI(); return; }
  journalTab = tab; openUI('journal'); renderJournal();
}

function renderJournal() {
  const tabs = [['skills', 'Skills', 'K'], ['magic', 'Magic', 'P'], ['inventory', 'Inventory', 'I'], ['quests', 'Quests', 'J'], ['map', 'Map', 'M']];
  let body = '';
  if (journalTab === 'inventory') body = invHTML();
  if (journalTab === 'quests') body = questsHTML();
  if (journalTab === 'skills') body = skillsHTML();
  if (journalTab === 'magic') body = magicHTML();
  if (journalTab === 'map') body = `<div class="mapwrap"><canvas id="mapcv" width="620" height="620"></canvas><div class="maplegend">▼ quest objective &nbsp; ➤ you &nbsp; Undiscovered places stay hidden until found.</div></div>`;
  showPanel(`<div class="journal"><div class="tabs">${tabs.map(([id, n, k]) => `<button data-act="tab" data-arg="${id}" class="${journalTab === id ? 'on' : ''}">${n} <small>${k}</small></button>`).join('')}
    <button class="x" data-act="close">✕</button></div><div class="jbody">${body}</div></div>`, 'wide');
  if (journalTab === 'map') drawMap();
}

function invHTML() {
  const P = G.player;
  let w = '', a = '', it = '';
  for (const id of G.owned.weapons) w += `<div class="row ${G.equip.weapon === id ? 'eq' : ''}"><span>${WEAPONS[id].name}</span><span class="dim">${WEAPONS[id].dmg} dmg</span>${G.equip.weapon === id ? '<em>equipped</em>' : `<button data-act="eqw" data-arg="${id}">Equip</button>`}</div>`;
  for (const id of G.owned.armors) a += `<div class="row ${G.equip.armor === id ? 'eq' : ''}"><span>${ARMORS[id].name}</span><span class="dim">${ARMORS[id].armor} armor</span>${G.equip.armor === id ? '<em>equipped</em>' : `<button data-act="eqa" data-arg="${id}">Equip</button>`}</div>`;
  const ids = Object.keys(G.inv).filter(k => G.inv[k] > 0);
  for (const id of ids) {
    const d = ITEMS[id];
    it += `<div class="row"><span>${d.name} <b>×${G.inv[id]}</b></span><span class="dim small">${d.desc}</span>${d.kind === 'potion' ? `<button data-act="use" data-arg="${id}">Use</button>` : d.kind === 'quest' ? '<em>quest</em>' : ''}</div>`;
  }
  return `<div class="cols"><div><h3>Weapons</h3>${w}<h3>Armor</h3>${a}</div><div><h3>Items <span class="gold">◉ ${G.gold} gold</span></h3>${it || '<p class="dim">Your pack is empty.</p>'}</div></div>`;
}

function questsHTML() {
  const ids = Object.keys(G.quests);
  const active = ids.filter(id => !G.quests[id].done).sort((a, b) => (b === 'main') - (a === 'main'));
  const done = ids.filter(id => G.quests[id].done);
  let h = '<h3>Active</h3>';
  if (!active.length) h += '<p class="dim">No active quests. Talk to the people of Ashvale.</p>';
  for (const id of active) {
    const q = G.quests[id], def = QUESTS[id];
    h += `<div class="quest ${def.main ? 'main' : ''}"><div class="qn">${def.title}${def.main ? ' <small>MAIN</small>' : ''}</div>`;
    for (let s = 0; s < q.stage; s++) h += `<div class="qs done">✓ ${esc(def.stages[s].text.replace(' ({n}/5)', '').replace(' ({n}/3)', ''))}</div>`;
    h += `<div class="qs">◇ ${esc(questText(id))}</div></div>`;
  }
  if (done.length) { h += '<h3>Completed</h3>'; for (const id of done) h += `<div class="quest done"><div class="qn">✓ ${QUESTS[id].title}</div></div>`; }
  return h;
}

function skillsHTML() {
  const P = G.player;
  const attr = P.attrPts > 0 ? `<div class="attr"><span>Level up! Raise an attribute (${P.attrPts}):</span>
    <button data-act="attr" data-arg="hp" class="hp">+10 Health</button><button data-act="attr" data-arg="mp" class="mp">+10 Magicka</button><button data-act="attr" data-arg="sp" class="sp">+10 Stamina</button></div>` : '';
  let list = '';
  for (const id in SKILLS) {
    const sk = P.skills[id], frac = sk.lvl >= 100 ? 1 : sk.xp / skillXpNeeded(sk.lvl);
    const avail = Object.keys(PERKS).some(k => PERKS[k].skill === id && perkState(k) === 'available');
    list += `<button class="skill ${selSkill === id ? 'on' : ''}" data-act="selskill" data-arg="${id}" style="--c:${SKILLS[id].color}">
      <span class="sn">${SKILLS[id].name}${avail ? ' <i>✦</i>' : ''}</span><span class="sl">${sk.lvl}</span><span class="sb"><span style="width:${frac * 100}%"></span></span></button>`;
  }
  // constellation
  const ids = Object.keys(PERKS).filter(k => PERKS[k].skill === selSkill);
  let lines = '', nodes = '';
  for (const k of ids) for (const q of PERKS[k].pre) {
    const a = PERKS[q], b = PERKS[k], lit = P.perks[q] && P.perks[k];
    lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${lit ? 'lit' : ''}"/>`;
  }
  for (const k of ids) {
    const p = PERKS[k], st = perkState(k);
    const shape = p.active ? `<rect x="${p.x - 3.2}" y="${p.y - 3.2}" width="6.4" height="6.4" transform="rotate(45 ${p.x} ${p.y})"/>` : `<circle cx="${p.x}" cy="${p.y}" r="3.3"/>`;
    nodes += `<g class="node ${st} ${selPerk === k ? 'sel' : ''}" data-act="selperk" data-arg="${k}">${shape}<text x="${p.x}" y="${p.y + 8}">${esc(p.name)}</text></g>`;
  }
  let detail = `<p class="dim">${SKILLS[selSkill].desc}</p><p class="dim small">Select a star to see the perk. ◆ diamonds are active abilities, ● circles are passive bonuses.</p>`;
  if (selPerk && PERKS[selPerk]) {
    const p = PERKS[selPerk], st = perkState(selPerk);
    const reason = { owned: '<em>Unlocked</em>', locked: `<span class="warn">Requires ${p.pre.map(q => PERKS[q].name).join(' or ')}</span>`,
      needskill: `<span class="warn">Requires ${SKILLS[p.skill].name} ${p.req}</span>`, nopoints: '<span class="warn">No perk points. Level up to earn more.</span>',
      available: `<button data-act="perk" data-arg="${selPerk}" class="unlock">Unlock perk</button>` }[st];
    detail = `<div class="pd"><b>${esc(p.name)}</b> <span class="tag ${p.active ? 'act' : ''}">${p.active ? 'ACTIVE' : 'PASSIVE'}</span>
      <span class="dim small">· ${SKILLS[p.skill].name} ${p.req}</span><p>${esc(p.desc)}${p.active ? ` <span class="dim">(${esc(ABILITIES[p.active].desc)})</span>` : ''}</p>${reason}</div>`;
  }
  const at = armorType();
  return `<div class="skhead"><div><b>Level ${P.level}</b> <span class="dim small">${Math.floor(P.xp)} / ${xpForLevel(P.level)} XP</span><div class="xpbar"><div style="width:${P.xp / xpForLevel(P.level) * 100}%"></div></div></div>
      <div class="stats3"><span>Health <b>${P.maxHp}</b></span><span>Magicka <b>${P.maxMp}</b></span><span>Stamina <b>${maxSp()}</b></span><span>Armor <b>${armorRating()}</b> <small class="dim">${at === 'none' ? '' : at}</small></span><span>Blessing <b>${G.flags.stone ? STONES[G.flags.stone].name.replace('The ', '') : '—'}</b></span></div>
      <div class="pts">Perk points <b>${P.perkPts}</b></div></div>${attr}
    <div class="skwrap"><div class="sklist">${list}</div>
      <div class="tree"><div class="treettl" style="color:${SKILLS[selSkill].color}">${SKILLS[selSkill].name} <span>${P.skills[selSkill].lvl}</span></div>
        <svg viewBox="-8 2 116 104" class="constel">${lines}${nodes}</svg><div class="detail">${detail}</div></div></div>
    <p class="dim small hint">Skills rise as you use them. Every skill increase earns character XP, and each new level gives a perk point. Trainers in Ashvale teach skills for gold.</p>`;
}

function magicHTML() {
  const P = G.player;
  let slots = '';
  P.hotbar.forEach((id, i) => {
    slots += `<div class="slot">${id ? `<span class="i">${ABILITIES[id].icon}</span><span>${esc(ABILITIES[id].name)}</span><button class="mini" data-act="unassign" data-arg="${i}">✕</button>` : '<span class="dim">empty</span>'}<b class="k">${i + 1}</b></div>`;
  });
  let rows = '';
  const known = Object.keys(ABILITIES).filter(id => P.spells[id]);
  for (const id of known) {
    const A = ABILITIES[id], c = abilityCost(id);
    const kind = A.school ? SKILLS[A.school].name + ' spell' : SKILLS[A.skill].name + ' power';
    const cost = c.mp ? `${c.mp} magicka` : c.sp ? `${c.sp} stamina` : 'free';
    rows += `<div class="arow"><span class="i">${A.icon}</span><div class="an"><b>${A.name}</b> <span class="dim small">${kind} · ${cost}${A.cd ? ` · ${A.cd}s cooldown` : ''}</span><br><span class="small">${esc(A.desc)}</span></div>
      <div class="assign">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<button class="mini ${P.hotbar[i] === id ? 'on' : ''}" data-act="assign" data-arg="${id}:${i}">${i + 1}</button>`).join('')}</div></div>`;
  }
  const locked = Object.keys(ABILITIES).filter(id => !P.spells[id]).map(id => ABILITIES[id].name);
  return `<h3>Hotbar</h3><div class="slots">${slots}</div>
    <h3>Known spells & powers</h3><p class="dim small">Click a number to put an ability on that hotbar key.</p>${rows}
    <h3>Shout</h3><div class="arow"><span class="i">◎</span><div class="an"><b>Unrelenting Force</b> <span class="dim small">[Z] · ${shoutCooldown()}s cooldown</span><br><span class="small">${G.flags.shout ? 'Staggers enemies and forces flying dragons to land.' : 'Learn it from a Word Wall.'}</span></div></div>
    ${locked.length ? `<p class="dim small">Still to discover: ${locked.join(', ')}. Unlock them in the Skills perk trees, or from Old Hilde.</p>` : ''}`;
}

function drawMap() {
  const cv = $('mapcv'); if (!cv) return;
  if (!mapImg) mapImg = renderMapImage(620);
  const ctx = cv.getContext('2d'), S = cv.width, k = S / 600;
  ctx.drawImage(mapImg, 0, 0);
  const tx = (x) => (x + 300) * k, tz = (z) => (z + 300) * k;
  ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'center';
  for (const id in LOCATIONS) {
    if (!G.flags.discovered[id]) continue;
    const L = LOCATIONS[id];
    ctx.fillStyle = '#1b1610'; ctx.beginPath(); ctx.arc(tx(L.x), tz(L.z), 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2e3c0'; ctx.fillText(L.icon, tx(L.x), tz(L.z) + 4.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3; ctx.strokeText(L.name, tx(L.x), tz(L.z) - 13); ctx.fillText(L.name, tx(L.x), tz(L.z) - 13);
  }
  for (const q of questTargets()) {
    ctx.fillStyle = '#ffcc33'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx(q.x), tz(q.z)); ctx.lineTo(tx(q.x) - 7, tz(q.z) - 12); ctx.lineTo(tx(q.x) + 7, tz(q.z) - 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  const P = G.player;
  ctx.save(); ctx.translate(tx(P.pos.x), tz(P.pos.z)); ctx.rotate(-P.yaw);
  ctx.fillStyle = '#ff4030'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#f2e3c0'; ctx.font = 'bold 18px Georgia'; ctx.fillText('N', S / 2, 20);
}

// ---------------------------------------------------------------- dialogue
export function openDialogue(n) { openUI('dialogue'); renderDialogue(n); }
function renderDialogue(n) {
  dialogueNode = n;
  showPanel(`<div class="dialogue"><div class="speaker">${esc(n.speaker)}</div><div class="say">${esc(n.text)}</div>
    <div class="opts">${n.options.map((o, i) => `<button data-act="opt" data-arg="${i}"><span class="num">${i + 1}</span>${esc(o.label)}</button>`).join('')}</div></div>`, 'bottom');
}
export function chooseOption(i) {
  if (G.ui !== 'dialogue' || !dialogueNode || !dialogueNode.options[i]) return;
  const next = dialogueNode.options[i].fn();
  if (next === undefined) return;
  if (next === null) { if (G.ui === 'dialogue') closeUI(); return; }
  renderDialogue(next);
}

// ---------------------------------------------------------------- shop
export function openShop() { openUI('shop'); renderShop(); }
function renderShop() {
  let b = '', s = '';
  SHOP_STOCK.forEach((e, i) => {
    const d = e.kind === 'item' ? ITEMS[e.id] : e.kind === 'weapon' ? WEAPONS[e.id] : ARMORS[e.id];
    const owned = (e.kind === 'weapon' && G.owned.weapons.includes(e.id)) || (e.kind === 'armor' && G.owned.armors.includes(e.id));
    const stat = e.kind === 'weapon' ? `${d.dmg} dmg` : e.kind === 'armor' ? `${d.armor} armor` : d.desc;
    const pr = buyPrice(entryBase(e));
    b += `<div class="row"><span>${d.name}</span><span class="dim small">${stat}</span>${owned ? '<em>owned</em>' : `<button data-act="buy" data-arg="${i}" ${G.gold < pr ? 'disabled' : ''}>◉ ${pr}</button>`}</div>`;
  });
  for (const id in G.inv) {
    const d = ITEMS[id]; if (!G.inv[id] || d.kind === 'quest') continue;
    s += `<div class="row"><span>${d.name} <b>×${G.inv[id]}</b></span><button data-act="sell" data-arg="${id}">Sell ◉ ${sellPrice(d.sell)}</button></div>`;
  }
  showPanel(`<div class="journal"><div class="tabs"><span class="ttl">Ysolde's Goods</span><span class="gold">◉ ${G.gold} gold</span><span class="dim small" style="margin-left:12px">Speech ${skill('speech')}</span><button class="x" data-act="close">✕</button></div>
    <div class="jbody"><div class="cols"><div><h3>Buy</h3>${b}</div><div><h3>Sell</h3>${s || '<p class="dim">Nothing to sell.</p>'}</div></div></div></div>`, 'wide');
}

// ---------------------------------------------------------------- menus
export function renderTitle() {
  G.ui = 'title';
  $('hud').classList.add('hidden');
  showPanel(`<div class="title"><div class="logo">ASHVALE</div><div class="subtitle">The Dragon of Frostspire</div>
    <div class="menu">${hasSave() ? '<button data-act="continue">Continue</button>' : ''}<button data-act="start">New Game</button><button data-act="controls">Controls</button><button data-act="gfx">Graphics: ${G.low ? 'Low' : 'High'}</button></div>
    <p class="dim small">A first-person fantasy RPG · Saves in your browser</p></div>`, 'full');
}
export function renderPause() {
  openUI('pause');
  showPanel(`<div class="title small"><div class="logo">Paused</div><div class="menu">
    <button data-act="resume">Resume</button><button data-act="save">Save Game</button>${hasSave() ? '<button data-act="load">Load Last Save</button>' : ''}
    <button data-act="controls">Controls</button><button data-act="title">Save & Quit to Title</button></div></div>`, 'full dim');
}
function renderControls(from) {
  const back = from === 'title' ? 'title' : 'pause';
  showPanel(`<div class="title small"><div class="logo">Controls</div><div class="controls">
    <div><b>W A S D</b> Move</div><div><b>Mouse</b> Look</div><div><b>Shift</b> Sprint</div><div><b>Space</b> Jump</div>
    <div><b>Left Click</b> Attack (hold: power attack)</div><div><b>Right Click</b> Block</div><div><b>1 – 8</b> Hotbar spells & powers</div><div><b>Z</b> Shout</div><div><b>C / Ctrl</b> Sneak</div><div><b>P</b> Magic & hotbar</div>
    <div><b>E</b> Talk / Loot / Use</div><div><b>Q / R</b> Health / Magicka potion</div><div><b>I</b> Inventory</div><div><b>J</b> Quests</div>
    <div><b>K</b> Skills & perk trees</div><div><b>M</b> Map</div><div><b>F5</b> Quick save</div><div><b>Esc</b> Pause</div></div>
    <div class="menu"><button data-act="back" data-arg="${back}">Back</button></div></div>`, 'full dim');
  G.ui = from;
}
export function showDeath() {
  setTimeout(() => {
    openUI('death');
    showPanel(`<div class="title small death"><div class="logo">You Died</div><div class="menu">
      ${hasSave() ? '<button data-act="load">Load Last Save</button>' : ''}<button data-act="newgame">New Game</button></div></div>`, 'full dim');
  }, 1600);
}
export function showVictory() {
  openUI('victory');
  showPanel(`<div class="title small"><div class="logo">Dragonslayer</div><div class="subtitle">Vyrmathax is dead and Ashvale is safe.</div>
    <p>Your legend is written — but the valley is still yours to explore. Finish your side quests, hunt the wilds, and find every chest.</p>
    <div class="menu"><button data-act="victoryok">Continue Exploring</button></div></div>`, 'full dim');
}

export function initUI() {
  $('click-to-play').addEventListener('click', () => { $('click-to-play').classList.add('hidden'); lockPointer(); });
}
