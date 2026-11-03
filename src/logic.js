import * as THREE from 'three';
import { G } from './state.js';
import { ITEMS, QUESTS, LOCATIONS, WEAPONS, ARMORS, STONES, PERKS, SKILLS, ABILITIES, xpForLevel } from './data.js';
import { sfx } from './audio.js';
import { notify, banner, openDialogue, openShop, showVictory, refreshPanel } from './ui.js';
import { newPlayer, refreshWeaponLook, maxSp, hasPerk, skill, useSkill, unlockPerk, learnAbility } from './player.js';
import { spawnAllEnemies, maybeSpawnDragon } from './entities.js';
import { ground } from './world.js';
import { burst } from './fx.js';

const SAVE_KEY = 'ashvale_save_v1';

// ---------------------------------------------------------------- items & progression
export function addItem(id, n = 1, silent = false) {
  G.inv[id] = (G.inv[id] || 0) + n;
  if (!silent) { notify(`+ ${ITEMS[id].name}${n > 1 ? ' ×' + n : ''}`); sfx.pickup(); }
  checkQuestItems();
}
export function removeItem(id, n = 1) { G.inv[id] = Math.max(0, (G.inv[id] || 0) - n); if (!G.inv[id]) delete G.inv[id]; }
export function addGold(n, silent = false) { G.gold += n; if (!silent && n) { notify(`+ ${n} gold`, 'gold'); sfx.gold(); } }

export function addXP(n) {
  const P = G.player; P.xp += n;
  while (P.xp >= xpForLevel(P.level)) {
    P.xp -= xpForLevel(P.level); P.level++; P.perkPts++; P.attrPts++; P.trained = 0;
    P.hp = P.maxHp; P.mp = P.maxMp; P.sp = maxSp();
    sfx.level(); banner(`Level ${P.level}`, 'Open Skills [K] to choose a perk and raise an attribute');
    burst(P.pos.clone().setY(P.pos.y + 1), 0xffd36a, 40, 5, 1.2, 0.12, -2);
  }
}

export function giveWeapon(id) { if (!G.owned.weapons.includes(id)) G.owned.weapons.push(id); G.equip.weapon = id; refreshWeaponLook(); notify(`Equipped ${WEAPONS[id].name}`, 'gold'); }
export function giveArmor(id) { if (!G.owned.armors.includes(id)) G.owned.armors.push(id); G.equip.armor = id; notify(`Equipped ${ARMORS[id].name}`, 'gold'); }

export function learnSpell(id, name) { learnAbility(id); banner('Spell Learned', name); sfx.quest(); }

// Quest gold, boosted by the Persuasion perk.
export const reward = (n) => Math.round(n * (hasPerk('persuasion') ? 1.25 : 1));
// Merchant prices, driven by Speech skill and perks.
export function buyPrice(base) {
  let m = 1.25 - skill('speech') / 300;
  if (hasPerk('haggling')) m *= 0.9; if (hasPerk('masterTrader')) m *= 0.85;
  return Math.max(1, Math.round(base * m));
}
export function sellPrice(base) {
  let m = 0.8 + skill('speech') / 300;
  if (hasPerk('haggling')) m *= 1.1; if (hasPerk('merchant')) m *= 1.2;
  return Math.max(1, Math.round(base * m));
}

// Skill trainers: pay gold for a skill point, up to 5 sessions per character level.
const trainCost = (id) => Math.round(skill(id) * 9 + 20);
function trainNode(n, ids, back) {
  const P = G.player, left = 5 - (P.trained || 0);
  return { speaker: n.name, text: left > 0 ? `I can teach you, for a price. (${left} training session${left === 1 ? '' : 's'} left this level)` : 'You\'ve learned all you can for now. Come back when you\'ve grown more experienced.',
    options: [...(left > 0 ? ids.map(id => ({ label: `Train ${SKILLS[id].name} ${skill(id)} → ${skill(id) + 1}  (${trainCost(id)} gold)`, fn: () => {
      if (skill(id) >= 90) return { speaker: n.name, text: 'There\'s nothing more I can teach you about that.', options: [{ label: 'Back', fn: () => trainNode(n, ids, back) }] };
      if (G.gold < trainCost(id)) return { speaker: n.name, text: 'Come back when you have the coin.', options: [{ label: 'Back', fn: () => trainNode(n, ids, back) }] };
      G.gold -= trainCost(id); P.trained = (P.trained || 0) + 1;
      const s = P.skills[id]; useSkill(id, 14 + s.lvl * 1.6 - s.xp + 0.01);
      return trainNode(n, ids, back);
    } })) : []), { label: 'Back', fn: back }] };
}

// ---------------------------------------------------------------- quests
export const qs = (id) => G.quests[id];
export function startQuest(id) {
  if (G.quests[id]) return;
  G.quests[id] = { stage: 0, done: false, n: 0 };
  sfx.quest(); banner('Quest Started', QUESTS[id].title);
  checkQuestItems();
}
export function setStage(id, stage) {
  const q = G.quests[id]; if (!q || q.done || q.stage >= stage) return;
  q.stage = stage;
  notify(`Quest updated: ${QUESTS[id].title}`, 'quest');
  sfx.quest();
  if (id === 'main') {
    if (stage === 4 && G.flags.shout) setStage('main', 5);
    if (stage === 5) maybeSpawnDragon();
  }
  autosave();
}
export function completeQuest(id) {
  const q = G.quests[id]; if (!q) return;
  q.done = true; banner('Quest Completed', QUESTS[id].title); sfx.quest();
  addXP(id === 'main' ? 500 : 120);
  autosave();
}
export function questText(id) {
  const q = G.quests[id], st = QUESTS[id].stages[q.stage];
  return st.text.replace('{n}', id === 'herbs' ? Math.min(5, G.inv.frostbloom || 0) : q.n);
}
function targetPos(t) {
  if (!t) return null;
  const [kind, key] = t.split(':');
  if (kind === 'loc') { const L = LOCATIONS[key]; return { x: L.x, z: L.z }; }
  const n = G.npcs.find(n => n.id === key); return n ? { x: n.pos.x, z: n.pos.z } : null;
}
export function questTargets() {
  const out = [];
  for (const id in G.quests) {
    const q = G.quests[id]; if (q.done) continue;
    const p = targetPos(QUESTS[id].stages[q.stage].target);
    if (p) out.push({ ...p, id, title: QUESTS[id].title });
  }
  return out;
}

export function checkQuestItems() {
  const q = G.quests;
  if (q.herbs && !q.herbs.done && q.herbs.stage === 0 && (G.inv.frostbloom || 0) >= 5) setStage('herbs', 1);
  if (q.heirloom && !q.heirloom.done && q.heirloom.stage === 0 && G.inv.amulet) setStage('heirloom', 1);
  if (q.main && !q.main.done && q.main.stage < 3 && q.main.stage >= 1 && G.inv.dragonstone) setStage('main', 3);
}

export function onKill(e) {
  addXP(e.def.xp);
  if (e.def.unique) G.flags.killed[e.def.unique] = true;
  const q = G.quests;
  if (e.type === 'wolf' && q.wolves && q.wolves.stage === 0) { q.wolves.n++; notify(`Wolves hunted: ${Math.min(q.wolves.n, 5)}/5`, 'quest'); if (q.wolves.n >= 5) setStage('wolves', 1); }
  if (e.tag === 'tower') {
    if (q.tower && q.tower.stage === 0) {
      q.tower.n = Math.min(3, q.tower.n + 1); notify(`Watchtower bandits: ${q.tower.n}/3`, 'quest');
      if (!G.enemies.some(o => o.tag === 'tower' && !o.dead)) { q.tower.n = 3; setStage('tower', 1); }
    }
  }
  if (e.type === 'dragon') setStage('main', 6);
}

// ---------------------------------------------------------------- interaction
export function findInteractable() {
  const P = G.player, cam = G.camera;
  const f = new THREE.Vector3(); cam.getWorldDirection(f);
  let best = null, bestScore = 1e9;
  const consider = (pos, range, obj) => {
    const dx = pos.x - P.pos.x, dz = pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d > range || Math.abs(pos.y - P.pos.y) > 4) return;
    const facing = d < 1.2 ? 1 : (dx * f.x + dz * f.z) / (d * Math.hypot(f.x, f.z) || 1);
    if (facing < 0.55) return;
    const score = d * (2 - facing);
    if (score < bestScore) { bestScore = score; best = obj; }
  };
  for (const n of G.npcs) consider(n.pos, 4, { label: `Talk to ${n.name}`, act: () => talkTo(n) });
  for (const e of G.enemies) if (e.dead && !e.looted) consider(e.pos, e.type === 'dragon' ? 9 : 3.2, { label: `Search ${e.def.name}`, act: () => lootCorpse(e) });
  for (const it of G.interactables) {
    if (it.kind === 'chest' && !G.flags.chests[it.id]) consider(it.pos, 2.8, { label: 'Open chest', act: () => openChest(it) });
    if (it.kind === 'herb' && !G.flags.herbs[it.id]) consider(it.pos, 2.6, { label: 'Pick Frostbloom', act: () => pickHerb(it) });
    if (it.kind === 'stone') consider(it.pos, 3.5, { label: G.flags.stone === it.id ? `${STONES[it.id].name} (active)` : `Touch ${STONES[it.id].name}`, act: () => chooseStone(it.id) });
    if (it.kind === 'wordwall') consider(it.pos, 6, { label: G.flags.shout ? 'Word Wall (learned)' : 'Approach the Word Wall', act: () => wordWall() });
  }
  return best;
}

function lootCorpse(e) {
  e.looted = true;
  const L = e.loot || {};
  let any = false;
  if (L.gold) { addGold(L.gold); any = true; }
  for (const id in L.items || {}) { addItem(id, L.items[id]); any = true; }
  if (e.type === 'dragon') {
    giveWeapon('dragonbone'); giveArmor('dragonscale'); any = true;
    notify('You fashion a blade and armor from the dragon\'s remains.', 'gold');
  }
  if (!any) notify('Nothing of value.');
}
function openChest(it) {
  G.flags.chests[it.id] = true; it.lid.rotation.x = -1.6;
  addGold(it.data.gold); for (const id in it.data.items) addItem(id, it.data.items[id]);
}
function pickHerb(it) { G.flags.herbs[it.id] = true; it.g.visible = false; addItem('frostbloom'); }
function chooseStone(id) {
  if (G.flags.stone === id) { notify('This blessing is already yours.'); return; }
  G.flags.stone = id; banner(STONES[id].name, STONES[id].desc); sfx.discover();
  burst(G.player.pos.clone().setY(G.player.pos.y + 1), STONES[id].color, 40, 4, 1.2, 0.12, -3);
}
function wordWall() {
  if (G.flags.shout) { notify('The wall\'s word already echoes within you.'); return; }
  G.flags.shout = true;
  banner('Word of Power Learned', 'Unrelenting Force — press [Z] to Shout');
  sfx.shout();
  const it = G.interactables.find(i => i.kind === 'wordwall');
  for (let i = 0; i < 4; i++) setTimeout(() => burst(it.pos.clone().setY(it.pos.y + 2), 0x6ad8ff, 30, 6, 1.2, 0.12, -2), i * 200);
  if (G.quests.main && G.quests.main.stage === 4) setStage('main', 5);
  autosave();
}

export function updateDiscovery() {
  const P = G.player;
  for (const k in LOCATIONS) {
    if (G.flags.discovered[k]) continue;
    const L = LOCATIONS[k];
    if (Math.hypot(P.pos.x - L.x, P.pos.z - L.z) < L.r * 0.8) {
      G.flags.discovered[k] = true;
      banner('Discovered', L.name); sfx.discover();
      if (k !== 'ashvale') addXP(15);
      if (k === 'barrow' && G.quests.main && G.quests.main.stage === 1) setStage('main', 2);
    }
  }
  if (G.flags.discovered.barrow && G.quests.main && G.quests.main.stage === 1 && Math.hypot(P.pos.x - LOCATIONS.barrow.x, P.pos.z - LOCATIONS.barrow.z) < 30) setStage('main', 2);
}

// ---------------------------------------------------------------- dialogue
const node = (speaker, text, options) => ({ speaker, text, options });
const bye = (label = 'Farewell.') => ({ label, fn: () => null });

function talkTo(n) { openDialogue(dialogue(n)); }

function dialogue(n) {
  const q = G.quests;
  switch (n.id) {
    case 'maren': {
      const m = q.main;
      if (!m || m.stage === 0) return node(n.name, 'Ah — a traveler, and armed. Good. Ashvale has seen dark omens: draugr walking in Hollowmere Barrow to the northwest, and a shadow with wings over Frostspire. The old songs say the barrow holds a Dragonstone — a carved map of every dragon lair in these lands. I need someone to fetch it.',
        [{ label: "I'll find the Dragonstone.", fn: () => { if (!q.main) startQuest('main'); setStage('main', 1); return node(n.name, 'Follow the old road northwest past the forest. The dead do not sleep easily there — and something worse guards the inner tomb. Go carefully.', [bye()]); } },
         { label: 'Tell me about Ashvale.', fn: () => node(n.name, 'A quiet village of hunters and smiths, ringed by a timber wall our grandparents raised. Trade with Ysolde, rest at the Sleeping Stag, and if you have a strong arm, folk here could use the help. Torvald, Brenna, Hilde and Captain Rolf all have troubles.', [{ label: 'Back', fn: () => dialogue(n) }, bye()]) },
         bye()]);
      if (m.stage <= 2) return node(n.name, G.inv.dragonstone ? 'You have it? Then hand it over!' : 'Hollowmere Barrow lies northwest along the old road. Beware the Deathlord who rules its dead.', [bye()]);
      if (m.stage === 3) return node(n.name, 'The Dragonstone! Look — the carving marks only one lair still active: Frostspire, the peak to the northeast. Vyrmathax nests there. No blade alone can bring a dragon down from the sky... but the Voice can. North of the barrow, on the windy hill, stands the Word Wall of Windward Shrine. Learn its Word.',
        [{ label: 'Hand over the Dragonstone.', fn: () => { removeItem('dragonstone'); addGold(reward(250)); setStage('main', 4); return node(n.name, 'Take this gold for your trouble. Now go — Windward Shrine, north of Hollowmere. The wind there carries old words.', [bye()]); } }]);
      if (m.stage === 4) return node(n.name, 'The Word Wall stands on the hill north of Hollowmere Barrow. Follow the old road past the barrow and up.', [bye()]);
      if (m.stage === 5) return node(n.name, 'Vyrmathax circles Frostspire to the northeast. When it flies, Shout [Z] at it to force it down — then strike! Bring potions. Many potions.', [bye()]);
      if (m.stage === 6 && !m.done) return node(n.name, 'The bells! The whole valley heard the dragon fall. You have done what no one in Ashvale has done in three hundred years. You are Dragonslayer.',
        [{ label: 'It is done.', fn: () => { addGold(reward(1000)); completeQuest('main'); G.flags.victory = true; setTimeout(showVictory, 1500); return null; } }]);
      return node(n.name, 'Ashvale owes you everything, Dragonslayer. The roads are yours to wander.', [bye()]);
    }
    case 'torvald': {
      const w = q.wolves;
      if (!w) return node(n.name, "Wolves. Bigger packs than I've seen in twenty winters, and bold enough to take sheep from inside the wall. I can't hunt them all myself. Put down five and I'll make it worth your while.",
        [{ label: 'I\'ll hunt them down.', fn: () => { startQuest('wolves'); return node(n.name, 'They range all around the valley — the forests east and west mostly. Watch your flanks; they hunt in packs.', [bye()]); } }, bye('Not now.')]);
      if (!w.done && w.stage === 0) return node(n.name, `Still hunting? ${w.n}/5 so far. Keep at it.`, [bye()]);
      if (!w.done && w.stage === 1) return node(n.name, 'Five wolves! The sheep will sleep easier, and so will I. Here — coin and a couple of my wife\'s potions.',
        [{ label: 'Glad to help.', fn: () => { addGold(reward(150)); addItem('healthPotion', 2); completeQuest('wolves'); return null; } }]);
      return node(n.name, 'Good hunting out there. If you take pelts, Ysolde pays fair coin for them.', [{ label: 'Teach me to move unseen. (Training)', fn: () => trainNode(n, ['sneak', 'lightArmor'], () => dialogue(n)) }, bye()]);
    }
    case 'brenna': {
      const h = q.heirloom;
      if (!h) return node(n.name, 'Bandits from Redfang Camp hit my forge last week. Took tools, steel, and... my mother\'s amulet. Their chief, Varg, wears it like a trophy. Get it back and I\'ll forge you a real blade.',
        [{ label: 'I\'ll get your amulet back.', fn: () => { startQuest('heirloom'); return node(n.name, 'The camp is southeast along the road. Varg is big and mean. Don\'t let his archers pin you down.', [bye()]); } }, bye('Not now.')]);
      if (!h.done && h.stage === 0) return node(n.name, 'Redfang Camp is southeast along the road. Varg has my amulet.', [bye()]);
      if (!h.done && h.stage === 1) return node(n.name, 'That\'s it — that\'s her amulet! Gods, thank you. A promise is a promise: this steel sword is the best thing I\'ve made all year.',
        [{ label: 'Take the sword.', fn: () => { removeItem('amulet'); giveWeapon('steel'); addGold(reward(80)); completeQuest('heirloom'); return null; } }]);
      return node(n.name, 'Keep that edge oiled. Ysolde sells some finer steel if you\'ve the coin.', [{ label: 'Train me. (Training)', fn: () => trainNode(n, ['oneHanded', 'heavyArmor'], () => dialogue(n)) }, bye()]);
    }
    case 'hilde': {
      const h = q.herbs;
      if (!h) return node(n.name, 'Frostbloom, dearie. Pale blue petals, cold as a winter morning — they grow by Silverpine Lake to the west and on the cold hills north. Bring me five and I\'ll teach you a spell that\'ll curl a bandit\'s beard.',
        [{ label: 'I\'ll gather them.', fn: () => { startQuest('herbs'); return node(n.name, 'They glow faintly. Look near the water\'s edge first.', [bye()]); } }, bye('Not now.')]);
      if (!h.done && h.stage === 0) return node(n.name, `You've got ${G.inv.frostbloom || 0} of five. The lake shore is the best place to look.`, [bye()]);
      if (!h.done && h.stage === 1) return node(n.name, 'Lovely, lovely. Now hold out your hand... feel that crackle? That\'s Lightning Bolt. Press [4] and point.',
        [{ label: 'Learn Lightning Bolt.', fn: () => { removeItem('frostbloom', 5); learnSpell('lightning', 'Lightning Bolt — added to your hotbar'); addItem('magickaPotion', 2); completeQuest('herbs'); return null; } }]);
      return node(n.name, 'Mind you don\'t zap yourself.', [{ label: 'Teach me magic. (Training)', fn: () => trainNode(n, ['destruction', 'restoration'], () => dialogue(n)) }, bye()]);
    }
    case 'rolf': {
      const t = q.tower;
      if (!t) return node(n.name, 'Bandits have taken the Old Watchtower south of the village. From there they can watch every road. I can\'t spare the men to root them out. Can you?',
        [{ label: 'Consider it done.', fn: () => { startQuest('tower'); return node(n.name, 'Follow the south road. There are at least three of them, one with a bow.', [bye()]); } }, bye('Not now.')]);
      if (!t.done && t.stage === 0) return node(n.name, 'The watchtower is down the south road. Clear out every last one.', [bye()]);
      if (!t.done && t.stage === 1) return node(n.name, 'The tower\'s clear? Fine work. Take this armor from the barracks — it\'ll serve you better than those rags.',
        [{ label: 'Thank you, Captain.', fn: () => { if (G.owned.armors.includes('leather') || ['steel', 'dragonscale'].includes(G.equip.armor)) addGold(reward(180)); else giveArmor('leather'); addGold(reward(100)); completeQuest('tower'); return null; } }]);
      return node(n.name, 'Roads are safer thanks to you.', [{ label: 'Spar with me. (Training)', fn: () => trainNode(n, ['block', 'oneHanded'], () => dialogue(n)) }, bye()]);
    }
    case 'ysolde':
      return node(n.name, 'Potions, steel, armor — and I buy whatever you drag back from the wilds. What\'ll it be?',
        [{ label: 'Show me your wares.', fn: () => { openShop(); return undefined; } }, { label: 'Teach me to haggle. (Training)', fn: () => trainNode(n, ['speech'], () => dialogue(n)) }, bye()]);
    case 'gunnar':
      return node(n.name, 'Welcome to the Sleeping Stag! Warm beds, warmer mead.',
        [{ label: 'Rent a room (10 gold) — rest until morning.', fn: () => {
            if (G.gold < 10) return node(n.name, 'Ten gold, friend. Come back when you\'ve got it.', [bye()]);
            G.gold -= 10; const P = G.player; P.hp = P.maxHp; P.mp = P.maxMp; P.sp = maxSp(); G.time = 7; autosave();
            return node(n.name, 'You sleep soundly and wake refreshed. (Health, magicka and stamina restored.)', [bye()]); } },
         { label: 'Heard any rumors?', fn: () => node(n.name, [
            'Folk say three standing stones east of here grant blessings to those who touch them. Only one at a time, mind.',
            'A hunter keeps a cabin far to the east. Bears roam out there.',
            'They say a chest sits atop Frostspire among the dragon bones. Nobody\'s been mad enough to fetch it.',
            'Draugr hate fire. And everything else, I suppose.',
            'Silverpine Lake to the west is lovely at dawn. Just watch for wolves.'][Math.floor(Math.random() * 5)], [{ label: 'Another rumor?', fn: () => dialogue(n).options[1].fn() }, bye()]) },
         bye()]);
  }
  return node(n.name, '...', [bye()]);
}

// ---------------------------------------------------------------- shop
export const SHOP_STOCK = [
  { kind: 'item', id: 'healthPotion' }, { kind: 'item', id: 'magickaPotion' }, { kind: 'item', id: 'staminaPotion' },
  { kind: 'weapon', id: 'steel' }, { kind: 'weapon', id: 'elven' },
  { kind: 'armor', id: 'leather' }, { kind: 'armor', id: 'steel' },
];
export function entryBase(entry) { return entry.kind === 'item' ? ITEMS[entry.id].price : entry.kind === 'weapon' ? WEAPONS[entry.id].price : ARMORS[entry.id].price; }
export function buy(entry) {
  const price = buyPrice(entryBase(entry));
  if (G.gold < price) { notify('Not enough gold', 'warn'); return; }
  if (entry.kind === 'weapon' && G.owned.weapons.includes(entry.id)) return;
  if (entry.kind === 'armor' && G.owned.armors.includes(entry.id)) return;
  G.gold -= price; sfx.gold(); useSkill('speech', price / 8 + 1);
  if (entry.kind === 'item') addItem(entry.id, 1);
  else if (entry.kind === 'weapon') giveWeapon(entry.id); else giveArmor(entry.id);
  refreshPanel();
}
export function sell(id) {
  if (!G.inv[id] || ITEMS[id].kind === 'quest') return;
  if (id === 'frostbloom' && G.quests.herbs && !G.quests.herbs.done && (G.inv.frostbloom || 0) <= 5) notify('Hilde needs those!', 'warn');
  const price = sellPrice(ITEMS[id].sell);
  removeItem(id, 1); G.gold += price; sfx.gold(); useSkill('speech', price / 8 + 1); refreshPanel();
}

// ---------------------------------------------------------------- perks / attributes
export function buyPerk(id) { if (unlockPerk(id)) { autosave(); refreshPanel(); } }
export function raiseAttr(a) {
  const P = G.player; if (P.attrPts <= 0) return;
  P.attrPts--;
  if (a === 'hp') { P.maxHp += 10; P.hp = P.maxHp; } if (a === 'mp') { P.maxMp += 10; P.mp = P.maxMp; } if (a === 'sp') { P.maxSp += 10; P.sp = maxSp(); }
  sfx.ui(); refreshPanel();
}

// ---------------------------------------------------------------- save / load
export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
export function save(silent = false) {
  if (G.player.dead) return;
  const P = G.player;
  const data = {
    v: 1, time: G.time, gold: G.gold, inv: G.inv, equip: G.equip, owned: G.owned, quests: G.quests, flags: G.flags,
    player: { ...P, pos: [P.pos.x, P.pos.y, P.pos.z], vel: undefined },
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); if (!silent) notify('Game saved'); }
  catch (e) { notify('Could not save (browser storage unavailable)', 'warn'); }
}
let autosaveT = 0;
export function autosave() { save(true); autosaveT = 0; }
export function tickAutosave(dt) { autosaveT += dt; if (autosaveT > 60) autosave(); }

function resetWorldVisuals() {
  for (const it of G.interactables) {
    if (it.kind === 'chest') it.lid.rotation.x = G.flags.chests[it.id] ? -1.6 : 0;
    if (it.kind === 'herb') it.g.visible = !G.flags.herbs[it.id];
  }
  refreshWeaponLook();
}

export function newGame() {
  G.player = newPlayer();
  G.player.pos.y = ground(G.player.pos.x, G.player.pos.z);
  G.inv = { healthPotion: 3, magickaPotion: 2 }; G.gold = 50; G.time = 8;
  G.equip = { weapon: 'iron', armor: 'clothes' }; G.owned = { weapons: ['iron'], armors: ['clothes'] };
  G.quests = {}; G.flags = { discovered: {}, chests: {}, herbs: {}, killed: {}, stone: null, shout: false, victory: false };
  G.quests.main = { stage: 0, done: false, n: 0 };
  resetWorldVisuals(); spawnAllEnemies();
}

export function load() {
  let data;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { data = null; }
  if (!data) return false;
  const P = newPlayer();
  Object.assign(P, data.player);
  P.pos = new THREE.Vector3(...data.player.pos); P.vel = new THREE.Vector3(); P.dead = false; P.vy = 0;
  P.atkCd = P.castCd = 0; P.swingT = P.castT = 0; P.pendingHit = -1; P.blocking = false; P.atkHold = -1;
  // migrate saves from before the skill system
  const fresh = newPlayer();
  for (const k in SKILLS) if (!P.skills || !P.skills[k]) { P.skills = P.skills || {}; P.skills[k] = fresh.skills[k]; }
  for (const k in P.perks) if (!PERKS[k]) { delete P.perks[k]; P.perkPts++; }
  for (const k in P.spells) if (!ABILITIES[k] || !P.spells[k]) delete P.spells[k];
  if (!Array.isArray(P.hotbar)) { P.hotbar = fresh.hotbar.slice(); for (const k in P.spells) if (!P.hotbar.includes(k)) { const i = P.hotbar.indexOf(null); if (i >= 0) P.hotbar[i] = k; } }
  P.cds = {}; P.dodgeDir = new THREE.Vector3(); P.wardT = P.stoneT = P.invisT = P.dodgeT = 0; P.crouch = false;
  G.player = P;
  G.time = data.time; G.gold = data.gold; G.inv = data.inv; G.equip = data.equip; G.owned = data.owned; G.quests = data.quests;
  G.flags = Object.assign({ discovered: {}, chests: {}, herbs: {}, killed: {}, stone: null, shout: false, victory: false }, data.flags);
  resetWorldVisuals(); spawnAllEnemies();
  G.target = null;
  return true;
}
