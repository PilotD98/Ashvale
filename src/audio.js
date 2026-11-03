// Tiny synthesized sound effects via WebAudio — no asset files needed.
let ctx = null, master = null, noiseBuf = null;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
export function setVolume(v) { if (master) master.gain.value = v; }

function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.3, freq = 1200, q = 1, type = 'bandpass', slide = 1, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slide !== 1) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}

export const sfx = {
  swing: () => noise(0.18, 0.25, 900, 0.8, 'bandpass', 2.5),
  hit: () => { tone(110, 0.15, 'square', 0.18, 0.5); noise(0.1, 0.3, 500, 1); },
  hurt: () => { tone(180, 0.2, 'sawtooth', 0.15, 0.6); },
  block: () => { tone(900, 0.12, 'triangle', 0.2, 0.7); noise(0.08, 0.2, 3000, 2); },
  fire: () => noise(0.5, 0.35, 400, 0.6, 'lowpass', 4),
  boom: () => { noise(0.6, 0.4, 300, 0.7, 'lowpass', 0.3); tone(70, 0.4, 'sine', 0.3, 0.5); },
  frost: () => { noise(0.6, 0.3, 4000, 3, 'bandpass', 0.4); tone(1200, 0.4, 'sine', 0.08, 0.6); },
  heal: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.4, 'sine', 0.12, 1, i * 0.08)); },
  zap: () => { noise(0.25, 0.4, 2500, 0.5, 'highpass'); tone(80, 0.25, 'sawtooth', 0.15, 0.6); },
  shout: () => { tone(90, 1.0, 'sawtooth', 0.35, 0.6); noise(0.9, 0.45, 300, 0.5, 'lowpass', 2); },
  pickup: () => { tone(660, 0.1, 'triangle', 0.15); tone(990, 0.12, 'triangle', 0.15, 1, 0.07); },
  gold: () => { tone(1320, 0.08, 'square', 0.06); tone(1760, 0.1, 'square', 0.06, 1, 0.06); },
  level: () => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.15, 1, i * 0.1)); },
  quest: () => { [440, 554, 659].forEach((f, i) => tone(f, 0.6, 'sine', 0.13, 1, i * 0.12)); },
  discover: () => { [330, 440, 587].forEach((f, i) => tone(f, 0.9, 'sine', 0.1, 1, i * 0.18)); },
  roar: () => { tone(60, 1.6, 'sawtooth', 0.4, 0.7); noise(1.5, 0.4, 200, 0.6, 'lowpass', 0.5); },
  arrow: () => noise(0.12, 0.2, 2500, 2, 'bandpass', 0.5),
  death: () => tone(200, 0.8, 'sawtooth', 0.2, 0.3),
  step: () => noise(0.05, 0.05, 300, 1),
  skill: () => { tone(587, 0.25, 'triangle', 0.1); tone(880, 0.35, 'triangle', 0.1, 1, 0.1); },
  ui: () => tone(800, 0.05, 'triangle', 0.08),
};
