// Shared mutable game state. Every module reads/writes through G.
export const G = {
  scene: null, camera: null, renderer: null,
  running: false, ui: null, time: 8, // hours
  player: null,
  inv: {}, gold: 0,
  equip: { weapon: 'iron', armor: 'clothes' },
  owned: { weapons: ['iron'], armors: ['clothes'] },
  quests: {},          // id -> { stage, done, n }
  flags: { discovered: {}, chests: {}, herbs: {}, killed: {}, stone: null, shout: false, victory: false },
  enemies: [], npcs: [], interactables: [], lights: [],
  target: null, targetT: 0,
  keys: {}, mouse: { left: false, right: false },
  locked: false,
};
