// ---------- Static game data: locations, items, enemies, quests, perks ----------

export const LOCATIONS = {
  ashvale:    { name: 'Ashvale', x: 0, z: 0, r: 46, icon: '⌂' },
  redfang:    { name: 'Redfang Camp', x: 130, z: 120, r: 30, icon: '⚔' },
  barrow:     { name: 'Hollowmere Barrow', x: -150, z: -120, r: 30, icon: '☗' },
  shrine:     { name: 'Windward Shrine', x: -60, z: -195, r: 20, icon: '᛭' },
  frostspire: { name: 'Frostspire Summit', x: 170, z: -170, r: 32, icon: '▲' },
  stones:     { name: 'Guardian Stones', x: 70, z: -55, r: 16, icon: '◆' },
  lake:       { name: 'Silverpine Lake', x: -110, z: 70, r: 42, icon: '≈' },
  tower:      { name: 'Old Watchtower', x: -40, z: 150, r: 20, icon: '♜' },
  cabin:      { name: "Hunter's Cabin", x: 200, z: 40, r: 16, icon: '⌂' },
};

// Roads radiate from Ashvale's well. Each is a polyline of [x,z] points.
export const ROADS = [
  [[0, 0], [60, 40], [130, 120]],
  [[0, 0], [-60, -50], [-150, -120], [-95, -170], [-60, -195]],
  [[0, 0], [-20, 80], [-40, 150]],
  [[0, 0], [70, -55], [120, -110]],
  [[0, 0], [100, 20], [200, 40]],
];

export const ITEMS = {
  healthPotion:  { name: 'Health Potion', price: 30, sell: 12, kind: 'potion', desc: 'Restores 60 health. [Q]' },
  magickaPotion: { name: 'Magicka Potion', price: 30, sell: 12, kind: 'potion', desc: 'Restores 60 magicka. [R]' },
  staminaPotion: { name: 'Stamina Potion', price: 20, sell: 8, kind: 'potion', desc: 'Restores all stamina.' },
  wolfPelt:      { name: 'Wolf Pelt', sell: 10, kind: 'misc', desc: 'Torvald would like to see these.' },
  bearPelt:      { name: 'Bear Pelt', sell: 40, kind: 'misc', desc: 'Thick, warm and valuable.' },
  relic:         { name: 'Ancient Relic', sell: 25, kind: 'misc', desc: 'A tarnished burial trinket.' },
  gem:           { name: 'Flawless Sapphire', sell: 60, kind: 'misc', desc: 'Traders pay well for these.' },
  frostbloom:    { name: 'Frostbloom', sell: 5, kind: 'misc', desc: 'A pale blue flower that is cold to the touch.' },
  amulet:        { name: "Brenna's Amulet", kind: 'quest', desc: 'A silver amulet with a hammer motif.' },
  dragonstone:   { name: 'Dragonstone', kind: 'quest', desc: 'A carved stone map marking a dragon lair.' },
};

export const WEAPONS = {
  iron:       { name: 'Iron Sword', dmg: 12, price: 0, color: 0x9a9a9a },
  steel:      { name: 'Steel Sword', dmg: 18, price: 240, color: 0xc8ccd2 },
  elven:      { name: 'Elven Blade', dmg: 26, price: 650, color: 0xe6c66a },
  dragonbone: { name: 'Dragonbone Blade', dmg: 38, price: 0, color: 0xf2ecd9 },
};

export const ARMORS = {
  clothes:     { name: 'Traveler\'s Clothes', armor: 8, price: 0, type: 'none' },
  leather:     { name: 'Leather Armor', armor: 24, price: 180, type: 'light' },
  steel:       { name: 'Steel Plate', armor: 42, price: 480, type: 'heavy' },
  dragonscale: { name: 'Dragonscale Armor', armor: 60, price: 0, type: 'light' },
};

// ---------------- Skills: improve by use (15 → 100), like Skyrim ----------------
export const SKILLS = {
  oneHanded:   { name: 'One-Handed', start: 20, color: '#d9a35a', desc: 'Swords and axes. Improves by landing melee hits.' },
  block:       { name: 'Block', start: 15, color: '#b8b0a0', desc: 'Parrying blows. Improves by blocking attacks.' },
  heavyArmor:  { name: 'Heavy Armor', start: 15, color: '#9aa4b0', desc: 'Plate armor. Improves by taking hits while wearing it.' },
  lightArmor:  { name: 'Light Armor', start: 15, color: '#a88a5e', desc: 'Leather and scale. Improves by taking hits while wearing it.' },
  destruction: { name: 'Destruction', start: 20, color: '#e0603a', desc: 'Fire, frost and shock. Improves by damaging enemies with spells.' },
  restoration: { name: 'Restoration', start: 20, color: '#f0d870', desc: 'Healing and wards. Improves by restoring health.' },
  sneak:       { name: 'Sneak', start: 15, color: '#7a8a9a', desc: 'Stay unseen. Press C to crouch. Improves by sneaking near enemies and sneak attacks.' },
  speech:      { name: 'Speech', start: 15, color: '#c08ad8', desc: 'Bartering and persuasion. Improves by buying and selling.' },
};

// Perk trees. `pre`: needs ANY one of these perks. `active`: unlocks an ability for the hotbar.
// x/y place the node on the constellation (0–100, root at the bottom).
const P_ = (skill, name, req, pre, x, y, desc, active) => ({ skill, name, req, pre, x, y, desc, active });
export const PERKS = {
  armsman:          P_('oneHanded', 'Armsman', 0, [], 50, 90, 'Sword and axe attacks deal 25% more damage.'),
  fightingStance:   P_('oneHanded', 'Fighting Stance', 20, ['armsman'], 28, 70, 'Power attacks cost 25% less stamina.'),
  whirlwindPerk:    P_('oneHanded', 'Whirlwind Strike', 30, ['fightingStance'], 14, 44, 'Spin and strike every enemy around you.', 'whirlwind'),
  bladesman:        P_('oneHanded', 'Bladesman', 40, ['armsman'], 72, 66, '15% chance of a critical hit for double damage.'),
  savageStrike:     P_('oneHanded', 'Savage Strike', 50, ['fightingStance'], 42, 42, 'Power attacks deal 25% more damage and stagger.'),
  paralyzingStrike: P_('oneHanded', 'Paralyzing Strike', 80, ['savageStrike', 'bladesman'], 62, 14, 'Power attacks have a 25% chance to paralyze for 3 seconds.'),

  shieldWall:       P_('block', 'Shield Wall', 0, [], 50, 90, 'Blocking absorbs 20% more damage.'),
  shieldBashPerk:   P_('block', 'Shield Bash', 20, ['shieldWall'], 28, 66, 'Bash enemies in front of you, knocking them back.', 'shieldBash'),
  deflectArrows:    P_('block', 'Deflect Arrows', 30, ['shieldWall'], 72, 66, 'Arrows that hit you while blocking do no damage.'),
  riposte:          P_('block', 'Riposte', 50, ['shieldBashPerk'], 24, 38, 'Blocked melee attacks reflect 40% of the damage back.'),
  elementalProt:    P_('block', 'Elemental Protection', 50, ['deflectArrows'], 76, 38, 'Blocking cuts frost and dragon breath by an extra 50%.'),
  blockRunner:      P_('block', 'Block Runner', 70, ['riposte', 'elementalProt'], 50, 14, 'Move at full speed while blocking.'),

  juggernaut:       P_('heavyArmor', 'Juggernaut', 0, [], 50, 90, 'Heavy armor rating +30%.'),
  conditioning:     P_('heavyArmor', 'Conditioning', 30, ['juggernaut'], 28, 60, 'Heavy armor no longer slows you down.'),
  ironWillPerk:     P_('heavyArmor', 'Iron Will', 40, ['juggernaut'], 72, 60, 'Brace yourself: +80 armor rating for 15 seconds.', 'stoneskin'),
  reflectBlows:     P_('heavyArmor', 'Reflect Blows', 70, ['conditioning', 'ironWillPerk'], 50, 22, '15% chance to reflect melee damage back at the attacker.'),

  agileDefender:    P_('lightArmor', 'Agile Defender', 0, [], 50, 90, 'Light armor rating +30%.'),
  evasionPerk:      P_('lightArmor', 'Evasive Roll', 20, ['agileDefender'], 28, 60, 'Dash out of harm\'s way, briefly untouchable.', 'dodge'),
  windWalker:       P_('lightArmor', 'Wind Walker', 30, ['agileDefender'], 72, 60, 'Stamina regenerates 50% faster and sprinting costs 40% less.'),
  deftMovement:     P_('lightArmor', 'Deft Movement', 60, ['evasionPerk', 'windWalker'], 50, 22, '15% chance to avoid all melee damage.'),

  noviceDest:       P_('destruction', 'Novice Destruction', 0, [], 50, 92, 'Destruction spells cost 25% less magicka.'),
  augFlames:        P_('destruction', 'Augmented Flames', 20, ['noviceDest'], 18, 72, 'Fire spells deal 35% more damage.'),
  augFrost:         P_('destruction', 'Augmented Frost', 20, ['noviceDest'], 50, 70, 'Frost spells deal 35% more damage and slow longer.'),
  augShock:         P_('destruction', 'Augmented Shock', 20, ['noviceDest'], 82, 72, 'Shock spells deal 35% more damage.'),
  fireballPerk:     P_('destruction', 'Fireball', 40, ['augFlames'], 14, 44, 'A huge explosive ball of fire.', 'fireball'),
  deepFreeze:       P_('destruction', 'Deep Freeze', 50, ['augFrost'], 50, 42, 'Frost spells have a 25% chance to freeze enemies solid.'),
  chainPerk:        P_('destruction', 'Chain Lightning', 50, ['augShock'], 86, 44, 'Lightning that arcs between up to 4 enemies.', 'chain'),
  impact:           P_('destruction', 'Impact', 40, ['augFlames', 'augFrost', 'augShock'], 32, 22, 'Destruction spells stagger enemies.'),
  expertDest:       P_('destruction', 'Expert Destruction', 75, ['fireballPerk', 'deepFreeze', 'chainPerk'], 68, 14, 'Destruction spells cost another 25% less and deal 20% more damage.'),

  noviceResto:      P_('restoration', 'Novice Restoration', 0, [], 50, 92, 'Restoration spells cost 25% less magicka.'),
  regeneration:     P_('restoration', 'Regeneration', 20, ['noviceResto'], 26, 72, 'Healing spells restore 50% more.'),
  wardPerk:         P_('restoration', 'Ward', 25, ['noviceResto'], 74, 72, 'A magical barrier that absorbs incoming damage.', 'ward'),
  respite:          P_('restoration', 'Respite', 30, ['regeneration'], 14, 48, 'Healing spells also restore stamina.'),
  recovery:         P_('restoration', 'Recovery', 30, ['noviceResto'], 50, 56, 'Magicka regenerates 50% faster.'),
  turnUndeadPerk:   P_('restoration', 'Turn Undead', 40, ['wardPerk'], 84, 46, 'Burn and terrify nearby undead.', 'turnUndead'),
  grandHealPerk:    P_('restoration', 'Grand Healing', 50, ['regeneration', 'recovery'], 38, 30, 'A powerful heal that restores 150 health.', 'grandHeal'),
  avoidDeath:       P_('restoration', 'Avoid Death', 80, ['grandHealPerk', 'turnUndeadPerk'], 62, 12, 'Once a minute, dropping below 10% health heals you for 150.'),

  stealth:          P_('sneak', 'Stealth', 0, [], 50, 90, 'You are 25% harder to detect while sneaking.'),
  backstab:         P_('sneak', 'Backstab', 30, ['stealth'], 24, 64, 'Sneak attacks with a blade deal 4× damage instead of 2×.'),
  muffled:          P_('sneak', 'Muffled Movement', 30, ['stealth'], 76, 64, 'Moving while sneaking is far quieter.'),
  vanishPerk:       P_('sneak', 'Shadow Cloak', 50, ['muffled'], 74, 36, 'Turn invisible for 8 seconds. Enemies lose track of you.', 'vanish'),
  assassin:         P_('sneak', 'Assassin\'s Blade', 70, ['backstab'], 26, 32, 'Sneak attacks with a blade deal 6× damage.'),
  shadowWarrior:    P_('sneak', 'Shadow Warrior', 90, ['assassin', 'vanishPerk'], 50, 10, 'Crouching in combat makes enemies briefly lose sight of you.'),

  haggling:         P_('speech', 'Haggling', 0, [], 50, 90, 'Buy for 10% less and sell for 10% more.'),
  persuasion:       P_('speech', 'Persuasion', 20, ['haggling'], 26, 64, 'Quest rewards pay 25% more gold.'),
  intimidatePerk:   P_('speech', 'Intimidate', 40, ['persuasion'], 22, 34, 'Terrify nearby enemies so they flee.', 'intimidate'),
  merchant:         P_('speech', 'Merchant', 30, ['haggling'], 74, 64, 'Sell items for 20% more.'),
  masterTrader:     P_('speech', 'Master Trader', 60, ['merchant', 'intimidatePerk'], 62, 26, 'Buy for a further 15% less.'),
};

// ---------------- Spells and active powers (assignable to hotbar keys 1–8) ----------------
export const ABILITIES = {
  firebolt:   { name: 'Firebolt', icon: '🔥', school: 'destruction', mp: 15, desc: 'Hurls a ball of fire that sets the target ablaze.' },
  frost:      { name: 'Frost Nova', icon: '❄', school: 'destruction', mp: 30, desc: 'Blasts nearby enemies with cold, slowing them.' },
  lightning:  { name: 'Lightning Bolt', icon: 'ϟ', school: 'destruction', mp: 22, desc: 'An instant bolt of lightning.' },
  fireball:   { name: 'Fireball', icon: '☄', school: 'destruction', mp: 45, cd: 2, desc: 'An explosive fireball that hits everything in a wide area.' },
  chain:      { name: 'Chain Lightning', icon: '⚡', school: 'destruction', mp: 40, cd: 1.5, desc: 'Lightning that arcs to up to 4 enemies.' },
  heal:       { name: 'Healing', icon: '✚', school: 'restoration', mp: 25, desc: 'Restores 45 health.' },
  ward:       { name: 'Ward', icon: '⛨', school: 'restoration', mp: 30, cd: 10, desc: 'Absorbs up to 70 damage for 10 seconds.' },
  turnUndead: { name: 'Turn Undead', icon: '☀', school: 'restoration', mp: 35, cd: 12, desc: 'Burns undead within 14 m and makes them flee.' },
  grandHeal:  { name: 'Grand Healing', icon: '✜', school: 'restoration', mp: 60, cd: 4, desc: 'Restores 150 health.' },
  whirlwind:  { name: 'Whirlwind Strike', icon: '🌀', skill: 'oneHanded', sp: 30, cd: 8, desc: 'Spin attack that hits every enemy around you.' },
  shieldBash: { name: 'Shield Bash', icon: '⛊', skill: 'block', sp: 20, cd: 5, desc: 'Knock back and stagger enemies in front of you.' },
  stoneskin:  { name: 'Iron Will', icon: '🛡', skill: 'heavyArmor', cd: 45, desc: '+80 armor rating for 15 seconds.' },
  dodge:      { name: 'Evasive Roll', icon: '➶', skill: 'lightArmor', sp: 15, cd: 1.5, desc: 'Dash in your movement direction, untouchable for a moment.' },
  vanish:     { name: 'Shadow Cloak', icon: '◐', skill: 'sneak', cd: 60, desc: 'Invisible for 8 seconds. Attacking breaks it.' },
  intimidate: { name: 'Intimidate', icon: '☠', skill: 'speech', cd: 45, desc: 'Enemies within 15 m flee for 6 seconds (not bosses).' },
};

export const STONES = {
  warrior: { name: 'The Warrior Stone', color: 0xff5533, desc: 'Sword damage +20%.' },
  mage:    { name: 'The Mage Stone', color: 0x4499ff, desc: 'Spells cost 20% less magicka.' },
  steed:   { name: 'The Steed Stone', color: 0x44ff88, desc: 'Move 15% faster and +25 stamina.' },
};

export const ENEMIES = {
  wolf:   { name: 'Wolf', hp: 40, dmg: 8, speed: 7.5, xp: 15, radius: 0.8, height: 1.1, aggro: 24, range: 1.9, cd: 1.2, model: 'wolf',
            loot: () => ({ items: { wolfPelt: 1 } }) },
  bear:   { name: 'Cave Bear', hp: 140, dmg: 18, speed: 6.5, xp: 45, radius: 1.3, height: 1.8, aggro: 18, range: 2.6, cd: 1.8, model: 'bear',
            loot: () => ({ items: { bearPelt: 1 } }) },
  bandit: { name: 'Bandit', hp: 70, dmg: 11, speed: 5.6, xp: 30, radius: 0.55, height: 1.9, aggro: 28, range: 2.0, cd: 1.3, model: 'bandit',
            loot: () => ({ gold: 5 + Math.floor(Math.random() * 20), items: Math.random() < 0.35 ? { healthPotion: 1 } : {} }) },
  archer: { name: 'Bandit Archer', hp: 50, dmg: 9, speed: 5.0, xp: 30, radius: 0.55, height: 1.9, aggro: 34, range: 22, cd: 2.2, model: 'archer', ranged: true,
            loot: () => ({ gold: 5 + Math.floor(Math.random() * 15), items: Math.random() < 0.3 ? { staminaPotion: 1 } : {} }) },
  chief:  { name: 'Varg the Redfang', hp: 240, dmg: 20, speed: 5.8, xp: 120, radius: 0.65, height: 2.1, aggro: 28, range: 2.3, cd: 1.4, model: 'chief', boss: true, unique: 'chief',
            loot: () => ({ gold: 90, items: { amulet: 1, healthPotion: 1 } }) },
  draugr: { name: 'Draugr', hp: 85, dmg: 13, speed: 4.3, xp: 40, radius: 0.55, height: 1.9, aggro: 24, range: 2.0, cd: 1.5, model: 'draugr',
            loot: () => ({ gold: Math.floor(Math.random() * 10), items: Math.random() < 0.6 ? { relic: 1 } : {} }) },
  lord:   { name: 'Draugr Deathlord', hp: 360, dmg: 24, speed: 4.6, xp: 220, radius: 0.75, height: 2.4, aggro: 26, range: 2.6, cd: 1.7, model: 'lord', boss: true, unique: 'lord',
            loot: () => ({ gold: 120, items: { dragonstone: 1, gem: 1 } }) },
  dragon: { name: 'Vyrmathax', hp: 1000, dmg: 30, speed: 9, xp: 1200, radius: 4, height: 4, aggro: 200, range: 7, cd: 2.0, model: 'dragon', boss: true, unique: 'dragon',
            loot: () => ({ gold: 300, items: { gem: 3 } }) },
};

// Enemy placements. `tag` groups enemies for quests.
export const SPAWNS = [
  { type: 'wolf', x: 60, z: 75, n: 3 },
  { type: 'wolf', x: -75, z: -40, n: 3 },
  { type: 'wolf', x: 115, z: -30, n: 3 },
  { type: 'wolf', x: -170, z: 10, n: 2 },
  { type: 'wolf', x: 25, z: -125, n: 3 },
  { type: 'wolf', x: -10, z: 205, n: 2 },
  { type: 'bear', x: 190, z: 75, n: 1 },
  { type: 'bear', x: -205, z: -45, n: 1 },
  { type: 'bear', x: 95, z: -115, n: 1 },
  { type: 'bandit', x: 130, z: 118, n: 3, spread: 8 },
  { type: 'archer', x: 128, z: 126, n: 2, spread: 10 },
  { type: 'chief', x: 136, z: 130, n: 1, spread: 0 },
  { type: 'bandit', x: -40, z: 146, n: 2, spread: 5, tag: 'tower' },
  { type: 'archer', x: -36, z: 154, n: 1, spread: 3, tag: 'tower' },
  { type: 'draugr', x: -150, z: -118, n: 4, spread: 10 },
  { type: 'lord', x: -150, z: -130, n: 1, spread: 0 },
];

export const CHESTS = [
  { id: 'camp', x: 140, z: 133, gold: 150, items: { healthPotion: 2 } },
  { id: 'barrow', x: -150, z: -136, gold: 200, items: { magickaPotion: 2, gem: 2 } },
  { id: 'tower', x: -36, z: 146, gold: 60, items: { staminaPotion: 1, healthPotion: 1 } },
  { id: 'cabin', x: 204, z: 45, gold: 40, items: { healthPotion: 2, wolfPelt: 2 } },
  { id: 'summit', x: 176, z: -178, gold: 500, items: { gem: 4 } },
  { id: 'shrine', x: -56, z: -191, gold: 50, items: { magickaPotion: 2 } },
  { id: 'lakeshore', x: -112, z: 98, gold: 80, items: { healthPotion: 1, magickaPotion: 1 } },
];

export const HERBS = [
  [-78, 48], [-136, 100], [-88, 104], [-146, 46], [-70, 80],
  [-42, -176], [-82, -176], [122, -128], [142, -120], [86, -72], [-30, -150], [205, -110],
];

export const QUESTS = {
  main: {
    title: 'The Dragon of Frostspire', main: true,
    stages: [
      { text: 'Speak with Elder Maren in Ashvale.', target: 'npc:maren' },
      { text: 'Travel to Hollowmere Barrow, northwest of Ashvale.', target: 'loc:barrow' },
      { text: 'Defeat the Draugr Deathlord and claim the Dragonstone.', target: 'loc:barrow' },
      { text: 'Bring the Dragonstone to Elder Maren.', target: 'npc:maren' },
      { text: 'Find the Word Wall at Windward Shrine.', target: 'loc:shrine' },
      { text: 'Climb Frostspire and slay the dragon Vyrmathax.', target: 'loc:frostspire' },
      { text: 'Return to Elder Maren.', target: 'npc:maren' },
    ],
  },
  wolves: {
    title: 'The Wolf Problem',
    stages: [
      { text: 'Hunt wolves in the wilds around Ashvale ({n}/5).' },
      { text: 'Return to Torvald the Hunter.', target: 'npc:torvald' },
    ],
  },
  heirloom: {
    title: 'Family Heirloom',
    stages: [
      { text: "Recover Brenna's amulet from Varg at Redfang Camp.", target: 'loc:redfang' },
      { text: 'Return the amulet to Brenna.', target: 'npc:brenna' },
    ],
  },
  herbs: {
    title: 'Frostbloom Harvest',
    stages: [
      { text: 'Gather Frostbloom near Silverpine Lake and the northern hills ({n}/5).', target: 'loc:lake' },
      { text: 'Bring the Frostbloom to Old Hilde.', target: 'npc:hilde' },
    ],
  },
  tower: {
    title: 'Bandits at the Watchtower',
    stages: [
      { text: 'Clear the bandits from the Old Watchtower ({n}/3).', target: 'loc:tower' },
      { text: 'Report to Captain Rolf.', target: 'npc:rolf' },
    ],
  },
};

export const xpForLevel = (lvl) => 80 + lvl * 70;
