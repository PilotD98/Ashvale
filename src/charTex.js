// Hand-painted (procedurally drawn) character textures: faces, outfits, armor, hair, fur, scales.
// Everything is drawn on 2D canvases at load time, and each texture gets a normal map derived from its detail.
import * as THREE from 'three';

// ------------------------------------------------------------------ canvas helpers
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a, b) => a + rnd() * (b - a);
function hex(c, k = 1, a = 1) { const col = new THREE.Color(c); return `rgba(${Math.round(Math.min(255, col.r * 255 * k))},${Math.round(Math.min(255, col.g * 255 * k))},${Math.round(Math.min(255, col.b * 255 * k))},${a})`; }

let noiseC = null;
function noiseCanvas() {
  if (noiseC) return noiseC;
  const [c, x] = cv(256, 256), img = x.createImageData(256, 256);
  // value noise at several octaves, tileable
  const oct = [[8, 0.5], [16, 0.25], [32, 0.15], [64, 0.1]];
  const grids = oct.map(([n]) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return g; });
  for (let y = 0; y < 256; y++) for (let x2 = 0; x2 < 256; x2++) {
    let v = 0;
    oct.forEach(([n, a], k) => {
      const fx = x2 / 256 * n, fy = y / 256 * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const g = grids[k], at = (i, j) => g[((j + n) % n) * n + ((i + n) % n)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      v += a * ((at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy);
    });
    const k = (y * 256 + x2) * 4, g = v * 255;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = g; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return (noiseC = c);
}
// overlay tileable noise (mottling) with a blend mode
function mottle(x, w, h, alpha = 0.25, mode = 'overlay', scale = 1) {
  x.save(); x.globalAlpha = alpha; x.globalCompositeOperation = mode;
  const p = x.createPattern(noiseCanvas(), 'repeat');
  if (scale !== 1) p.setTransform(new DOMMatrix().scale(scale));
  x.fillStyle = p; x.fillRect(0, 0, w, h); x.restore();
}
function grain(x, w, h, n = 4000, a = 0.06) {
  for (let i = 0; i < n; i++) { x.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
}
function weave(x, w, h, a = 0.08, step = 3) {
  x.save(); x.globalAlpha = a; x.fillStyle = '#000';
  for (let y = 0; y < h; y += step) x.fillRect(0, y, w, 1);
  x.globalAlpha = a * 0.7;
  for (let i = 0; i < w; i += step) x.fillRect(i, 0, 1, h);
  x.restore();
}
function stitches(x, x0, y0, x1, y1, col = 'rgba(30,20,10,0.7)', len = 5, gap = 4) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(d / (len + gap));
  x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath();
  for (let i = 0; i < n; i++) { const t0 = i * (len + gap) / d, t1 = (i * (len + gap) + len) / d; x.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0); x.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1); }
  x.stroke();
}
function rivet(x, px, py, r = 4) {
  const g = x.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(160,160,160,1)'); g.addColorStop(1, 'rgba(40,40,40,1)');
  x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
}
// decorative band: trim with embroidery motif
function trimBand(x, y, w, hgt, base, accent, motif = 'zigzag') {
  x.fillStyle = hex(base); x.fillRect(0, y, w, hgt);
  x.fillStyle = hex(base, 0.6); x.fillRect(0, y, w, 2); x.fillRect(0, y + hgt - 2, w, 2);
  x.strokeStyle = hex(accent); x.fillStyle = hex(accent); x.lineWidth = 2;
  const m = hgt * 0.7, cy = y + hgt / 2;
  if (motif === 'zigzag') { x.beginPath(); for (let i = 0; i <= w; i += m) x.lineTo(i, (i / m) % 2 ? cy - m / 3 : cy + m / 3); x.stroke(); }
  else if (motif === 'diamond') { for (let i = m / 2; i < w; i += m * 1.2) { x.beginPath(); x.moveTo(i, cy - m / 2.5); x.lineTo(i + m / 3, cy); x.lineTo(i, cy + m / 2.5); x.lineTo(i - m / 3, cy); x.closePath(); x.fill(); } }
  else if (motif === 'knot') { for (let i = 0; i < w; i += m) { x.beginPath(); x.arc(i + m / 2, cy, m / 3.2, 0, 7); x.stroke(); x.beginPath(); x.moveTo(i, cy); x.lineTo(i + m, cy); x.stroke(); } }
  weave(x, w, hgt + y, 0.05);
}

// normal map from the luminance of a canvas (sobel), returns a linear texture
function normalFrom(src, strength = 2.5, invert = false) {
  const w = src.width, h = src.height, sx = src.getContext('2d').getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (sx[i * 4] * 0.3 + sx[i * 4 + 1] * 0.59 + sx[i * 4 + 2] * 0.11) / 255 * (invert ? -1 : 1);
  const [c, x] = cv(w, h), img = x.createImageData(w, h), d = img.data;
  const L = (i, j) => lum[((j + h) % h) * w + ((i + w) % w)];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (L(i + 1, j - 1) + 2 * L(i + 1, j) + L(i + 1, j + 1)) - (L(i - 1, j - 1) + 2 * L(i - 1, j) + L(i - 1, j + 1));
    const dy = (L(i - 1, j + 1) + 2 * L(i, j + 1) + L(i + 1, j + 1)) - (L(i - 1, j - 1) + 2 * L(i, j - 1) + L(i + 1, j - 1));
    let nx = -dx * strength * 0.22, ny = dy * strength * 0.22, nz = 1; const l = Math.hypot(nx, ny, nz);
    const k = (j * w + i) * 4; d[k] = (nx / l * 0.5 + 0.5) * 255; d[k + 1] = (ny / l * 0.5 + 0.5) * 255; d[k + 2] = (nz / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function tex(c, wrap = true) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) { seed = 1 + [...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 100000, 7); cache.set(key, fn()); } return cache.get(key); }
// builds a standard material from a painter. painter returns { c (canvas), e (emissive canvas)?, n (normal strength), rough, metal }
function material(key, painter) {
  return cached(key, () => {
    const p = painter();
    const m = new THREE.MeshStandardMaterial({ map: tex(p.c), normalMap: normalFrom(p.n_src || p.c, p.n ?? 2.5, p.n_inv), roughness: p.rough ?? 0.85, metalness: p.metal ?? 0, side: p.side ?? THREE.FrontSide });
    m.normalScale.set(1, 1);
    const k = p.bright ?? (p.metal > 0.5 ? 1.1 : 1.6); m.color.setRGB(k, k, k);
    if (p.e) { m.emissiveMap = tex(p.e); m.emissive = new THREE.Color(p.eCol ?? 0xffffff); m.emissiveIntensity = p.eI ?? 2.5; }
    if (p.roughC) m.roughnessMap = tex(p.roughC);
    return m;
  });
}

// ------------------------------------------------------------------ FACE (sphere UV: face centred at u=0.25, equator at v=0.5)
export function faceMaterial(o) {
  return material('face' + JSON.stringify(o), () => {
    const W = 512, H = 256, [c, x] = cv(W, H);
    const skin = o.skin ?? 0xd9a882, undead = !!o.undead, cx = 128, eyeY = 116;
    x.fillStyle = hex(skin); x.fillRect(0, 0, W, H);
    mottle(x, W, H, undead ? 0.5 : 0.18, 'overlay');
    // soft shading: centre of face lighter, sides/back slightly darker
    const g = x.createRadialGradient(cx, 125, 10, cx, 125, 170); g.addColorStop(0, 'rgba(255,240,230,0.12)'); g.addColorStop(1, 'rgba(60,30,20,0.18)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (!undead) {
      for (const s of [-1, 1]) { const ch = x.createRadialGradient(cx + s * 30, 150, 0, cx + s * 30, 150, 22); ch.addColorStop(0, 'rgba(200,80,70,0.22)'); ch.addColorStop(1, 'rgba(200,80,70,0)'); x.fillStyle = ch; x.fillRect(cx + s * 30 - 25, 125, 50, 50); }
    }
    // eye sockets + eyes
    for (const s of [-1, 1]) {
      const ex = cx + s * 22;
      const so = x.createRadialGradient(ex, eyeY, 2, ex, eyeY, undead ? 18 : 14); so.addColorStop(0, undead ? 'rgba(5,5,5,0.95)' : 'rgba(90,50,40,0.35)'); so.addColorStop(1, 'rgba(90,50,40,0)');
      x.fillStyle = so; x.fillRect(ex - 20, eyeY - 20, 40, 40);
      if (!undead) {
        x.fillStyle = '#f2ece4'; x.beginPath(); x.ellipse(ex, eyeY, 10.5, 5.6, 0, 0, 7); x.fill();
        x.fillStyle = hex(o.eyeCol ?? 0x5a7a9a); x.beginPath(); x.arc(ex + s * 0.5, eyeY, 5, 0, 7); x.fill();
        x.fillStyle = '#0a0806'; x.beginPath(); x.arc(ex + s * 0.5, eyeY, 2, 0, 7); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(ex + s * 0.5 - 2, eyeY - 2.5, 1.6, 1.6);
        x.strokeStyle = 'rgba(40,20,15,0.85)'; x.lineWidth = o.female ? 2.2 : 1.6; x.beginPath(); x.ellipse(ex, eyeY + 1, 10, 5.5, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
        x.strokeStyle = 'rgba(80,40,30,0.35)'; x.lineWidth = 1; x.beginPath(); x.ellipse(ex, eyeY + 1, 10, 6, 0, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
      }
    }
    // brows
    if (!undead) {
      x.strokeStyle = hex(o.brow ?? o.hair ?? 0x3a2a1a, 0.6); x.lineCap = 'round';
      for (const s of [-1, 1]) { x.lineWidth = o.female ? 3 : 5; x.beginPath(); x.moveTo(cx + s * 12, eyeY - 12); x.quadraticCurveTo(cx + s * 22, eyeY - 17 - (o.angry ? -3 : 0), cx + s * 33, eyeY - 12); x.stroke(); }
    }
    // nose shading and nostrils
    x.fillStyle = undead ? 'rgba(0,0,0,0.6)' : 'rgba(110,60,45,0.28)';
    x.beginPath(); x.ellipse(cx - 5, 146, 3, 2, 0, 0, 7); x.ellipse(cx + 5, 146, 3, 2, 0, 0, 7); x.fill();
    const ns = x.createLinearGradient(cx - 10, 0, cx + 10, 0); ns.addColorStop(0, 'rgba(100,50,40,0.18)'); ns.addColorStop(0.5, 'rgba(255,230,210,0.1)'); ns.addColorStop(1, 'rgba(100,50,40,0.18)');
    x.fillStyle = ns; x.fillRect(cx - 10, 118, 20, 26);
    // mouth
    if (undead) {
      x.fillStyle = '#120a08'; x.beginPath(); x.ellipse(cx, 165, 15, 7, 0, 0, 7); x.fill();
      x.fillStyle = '#d8ccb0'; for (let i = -3; i <= 3; i++) { x.fillRect(cx + i * 4 - 1.5, 159, 3, 4 + rnd() * 2); x.fillRect(cx + i * 4 - 1.5, 168, 3, 3 + rnd() * 2); }
    } else {
      x.fillStyle = hex(o.lip ?? (o.female ? 0xb05a55 : 0xa86a5a)); x.beginPath(); x.moveTo(cx - 13, 164); x.quadraticCurveTo(cx, 158, cx + 13, 164); x.quadraticCurveTo(cx, 172, cx - 13, 164); x.fill();
      x.strokeStyle = 'rgba(60,25,20,0.8)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(cx - 13, 164); x.quadraticCurveTo(cx, 166, cx + 13, 164); x.stroke();
    }
    // age lines
    if (o.age) {
      x.strokeStyle = `rgba(90,50,40,${0.25 * o.age})`; x.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(cx - 22, 88 + i * 6); x.quadraticCurveTo(cx, 85 + i * 6, cx + 22, 88 + i * 6); x.stroke(); }
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(cx + s * 33, eyeY - 2 + i * 4); x.lineTo(cx + s * 41, eyeY - 5 + i * 6); x.stroke(); }
        x.beginPath(); x.moveTo(cx + s * 9, 140); x.quadraticCurveTo(cx + s * 19, 155, cx + s * 17, 170); x.stroke();
      }
    }
    // stubble / beard shadow
    if (o.stubble) { x.save(); x.globalAlpha = 0.35; for (let i = 0; i < 1600; i++) { const a = rnd() * Math.PI, r = R(32, 62); const px = cx + Math.cos(a) * r * 0.9, py = 148 + Math.sin(a) * r * 0.55; if (py > 152) { x.fillStyle = hex(o.stubble, 0.6); x.fillRect(px, py, 1.2, 1.2); } } x.restore(); }
    // hair painted on the scalp (top + back of head)
    if (o.hair !== undefined && !o.bald) {
      x.fillStyle = hex(o.hair); x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W, 175); x.lineTo(256 + 40, 170);
      x.quadraticCurveTo(cx + 70, 110, cx + 45, 80); x.quadraticCurveTo(cx, 66, cx - 45, 80); x.quadraticCurveTo(cx - 70, 110, 0, 160); x.closePath(); x.fill();
      x.strokeStyle = hex(o.hair, 0.65); x.lineWidth = 1; for (let i = 0; i < 500; i++) { const px = rnd() * W, py = rnd() * 60; x.beginPath(); x.moveTo(px, py); x.lineTo(px + R(-6, 6), py + R(10, 30)); x.stroke(); }
    }
    // war paint
    if (o.paint) {
      x.fillStyle = hex(o.paint, 1, 0.8);
      if (o.paintStyle === 'claws') for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(cx + 18 + i * 7, 96); x.lineTo(cx + 22 + i * 7, 150); x.lineTo(cx + 25 + i * 7, 96); x.fill(); }
      else { x.fillRect(cx - 42, eyeY - 9, 84, 16); x.fillStyle = hex(o.paint, 0.5, 0.7); x.fillRect(cx - 3, eyeY + 8, 6, 60); }
      for (const s of [-1, 1]) if (!undead) { x.fillStyle = '#f2ece4'; x.beginPath(); x.ellipse(cx + s * 22, eyeY, 9, 4.6, 0, 0, 7); x.fill(); x.fillStyle = hex(o.eyeCol ?? 0x5a7a9a); x.beginPath(); x.arc(cx + s * 22.5, eyeY, 4.2, 0, 7); x.fill(); x.fillStyle = '#0a0806'; x.beginPath(); x.arc(cx + s * 22.5, eyeY, 2, 0, 7); x.fill(); }
    }
    if (o.scar) { x.strokeStyle = 'rgba(150,70,60,0.8)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(cx + 30, eyeY - 22); x.lineTo(cx + 18, eyeY + 25); x.stroke(); }
    let e = null;
    if (undead) {
      // cracked, desiccated skin
      x.strokeStyle = 'rgba(20,15,10,0.6)'; x.lineWidth = 1;
      for (let i = 0; i < 60; i++) { let px = rnd() * W, py = rnd() * H; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += R(-10, 10); py += R(-10, 10); x.lineTo(px, py); } x.stroke(); }
      mottle(x, W, H, 0.35, 'multiply', 2);
      const [ec, exx] = cv(W, H); exx.fillStyle = '#000'; exx.fillRect(0, 0, W, H);
      for (const s of [-1, 1]) { const gl = exx.createRadialGradient(cx + s * 22, eyeY, 0, cx + s * 22, eyeY, 9); gl.addColorStop(0, '#fff'); gl.addColorStop(0.4, hex(o.eyeGlow ?? 0x66ccff)); gl.addColorStop(1, 'rgba(0,0,0,0)'); exx.fillStyle = gl; exx.fillRect(cx + s * 22 - 10, eyeY - 10, 20, 20); }
      e = ec;
    }
    grain(x, W, H, 2500, 0.04);
    return { c: x.canvas, n: undead ? 4 : 1.2, rough: undead ? 0.9 : 0.62, e, eCol: o.eyeGlow ?? 0x66ccff, eI: 3, bright: 1.25 };
  });
}

// ------------------------------------------------------------------ TORSO / SKIRT / SLEEVE (lathe UV: u around with front at u=0.5, v=0 at bottom)
// o: { type: tunic|robe|leather|chain|plate|wraps|apron-over, base, trim, accent, motif, emblem }
export function outfitMaterial(o, part = 'torso') {
  return material(part + JSON.stringify(o), () => {
    const W = 512, H = 512, [c, x] = cv(W, H);
    const t = o.type, base = o.base ?? 0x6b5a45, trim = o.trim ?? 0x3a2a1a, acc = o.accent ?? 0xd8b050;
    let rough = 0.9, metal = 0, n = 2.2;
    const front = 256;
    if (t === 'leather') {
      x.fillStyle = hex(base); x.fillRect(0, 0, W, H); mottle(x, W, H, 0.45, 'overlay'); mottle(x, W, H, 0.2, 'multiply', 2);
      // creases
      x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 1; for (let i = 0; i < 200; i++) { const px = rnd() * W, py = rnd() * H; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + R(-8, 8), py + R(-8, 8), px + R(-16, 16), py + R(-5, 5)); x.stroke(); }
      if (part === 'torso') {
        // stitched panels across the front and back
        for (const cxp of [front, 0, W]) {
          for (let r = 0; r < 4; r++) {
            const y = 140 + r * 78, w2 = 150;
            x.fillStyle = hex(base, 0.85 + (r % 2) * 0.1); x.fillRect(cxp - w2 / 2, y, w2, 70);
            x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 2; x.strokeRect(cxp - w2 / 2, y, w2, 70);
            stitches(x, cxp - w2 / 2 + 5, y + 5, cxp + w2 / 2 - 5, y + 5, 'rgba(220,200,160,0.55)');
            stitches(x, cxp - w2 / 2 + 5, y + 65, cxp + w2 / 2 - 5, y + 65, 'rgba(220,200,160,0.55)');
            for (const sx of [-1, 1]) rivet(x, cxp + sx * (w2 / 2 - 12), y + 35, 4);
          }
        }
        // shoulder strap / bandolier with buckle
        x.strokeStyle = hex(trim); x.lineWidth = 26; x.beginPath(); x.moveTo(front - 120, 0); x.lineTo(front + 110, 470); x.stroke();
        stitches(x, front - 128, 0, front + 102, 470, 'rgba(220,200,160,0.5)'); stitches(x, front - 108, 0, front + 122, 470, 'rgba(220,200,160,0.5)');
        x.fillStyle = hex(0xb09040); x.fillRect(front - 12, 220, 24, 30); x.fillStyle = hex(trim); x.fillRect(front - 6, 226, 12, 18);
      }
      rough = 0.62; n = 3;
    } else if (t === 'chain') {
      x.fillStyle = '#3a3c40'; x.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 6) for (let i = 0; i < W; i += 8) {
        const ox = (y / 6) % 2 ? 4 : 0; const gr = x.createRadialGradient(i + ox, y + 2, 0, i + ox, y + 3, 5);
        gr.addColorStop(0, 'rgba(200,205,210,1)'); gr.addColorStop(0.6, 'rgba(110,115,120,1)'); gr.addColorStop(1, 'rgba(20,20,20,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(i + ox, y + 3, 4, Math.PI, 0); x.fill();
      }
      mottle(x, W, H, 0.3, 'multiply');
      rough = 0.45; metal = 0.85; n = 3;
      if (o.tabard !== undefined && part !== 'sleeve') {
        const tw = 170; x.fillStyle = hex(o.tabard); x.fillRect(front - tw / 2, 0, tw, H);
        weave(x, W, H, 0.06); x.fillStyle = hex(acc); x.fillRect(front - tw / 2, 0, 10, H); x.fillRect(front + tw / 2 - 10, 0, 10, H);
        // emblem
        x.fillStyle = hex(acc); x.beginPath(); x.moveTo(front, 230); x.lineTo(front + 34, 290); x.lineTo(front, 350); x.lineTo(front - 34, 290); x.closePath(); x.fill();
        x.fillStyle = hex(o.tabard, 0.7); x.beginPath(); x.arc(front, 290, 14, 0, 7); x.fill();
        mottle(x, W, H, 0.15, 'overlay');
      }
    } else if (t === 'plate') {
      const col = base;
      x.fillStyle = hex(col); x.fillRect(0, 0, W, H); mottle(x, W, H, 0.25, 'overlay');
      for (let i = 0; i < W; i += 2) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; x.fillRect(i, 0, 1, H); }
      const bands = part === 'sleeve' ? 5 : 7;
      for (let b = 0; b < bands; b++) {
        const y = b * H / bands, hh = H / bands;
        const g = x.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(0.15, 'rgba(255,255,255,0.05)'); g.addColorStop(0.85, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
        x.fillStyle = g; x.fillRect(0, y, W, hh);
        for (let i = 12; i < W; i += 64) rivet(x, i, y + hh - 9, 3.5);
      }
      if (o.runes) { x.strokeStyle = hex(acc, 1, 0.9); x.lineWidth = 2; for (let i = 0; i < 40; i++) { const px = front + R(-90, 90), py = R(60, 460); x.beginPath(); x.moveTo(px, py); x.lineTo(px + R(-8, 8), py + R(6, 14)); x.lineTo(px + R(-8, 8), py + R(14, 22)); x.stroke(); } }
      if (part === 'torso') { x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(front - 3, 0, 6, H); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(front + 3, 0, 4, H); }
      // rust and wear
      x.save(); x.globalAlpha = o.rust ?? 0.15; x.globalCompositeOperation = 'multiply'; const p = x.createPattern(noiseCanvas(), 'repeat'); x.fillStyle = p; x.fillRect(0, 0, W, H); x.restore();
      if (o.rust) { for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${R(90, 140)},${R(40, 60)},20,${R(0.1, 0.4)})`; x.beginPath(); x.arc(rnd() * W, rnd() * H, R(2, 9), 0, 7); x.fill(); } }
      rough = 0.38; metal = 0.9; n = 2;
    } else if (t === 'wraps') {
      x.fillStyle = hex(base); x.fillRect(0, 0, W, H);
      let y = 0;
      while (y < H) {
        const hh = R(14, 30); x.fillStyle = hex(base, R(0.7, 1.25)); x.save(); x.translate(0, y); x.rotate(R(-0.06, 0.06)); x.fillRect(-20, 0, W + 40, hh);
        x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(-20, hh - 3, W + 40, 3); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(-20, 0, W + 40, 2); x.restore();
        y += hh * 0.8;
      }
      weave(x, W, H, 0.1, 2); mottle(x, W, H, 0.5, 'multiply', 1.5);
      for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(10,8,6,0.85)'; x.beginPath(); x.ellipse(rnd() * W, rnd() * H, R(3, 12), R(2, 6), rnd() * 3, 0, 7); x.fill(); } // holes
      for (let i = 0; i < 25; i++) { x.fillStyle = `rgba(60,40,20,${R(0.2, 0.5)})`; x.beginPath(); x.arc(rnd() * W, rnd() * H, R(10, 40), 0, 7); x.fill(); } // stains
      rough = 0.95; n = 3.5;
    } else { // cloth: tunic / robe / dress
      x.fillStyle = hex(base); x.fillRect(0, 0, W, H);
      mottle(x, W, H, 0.22, 'overlay'); weave(x, W, H, 0.09, 3); grain(x, W, H, 3000, 0.04);
      // folds: soft vertical shading
      for (let i = 0; i < 16; i++) { const px = rnd() * W, g = x.createLinearGradient(px - 18, 0, px + 18, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, `rgba(0,0,0,${R(0.05, 0.14)})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - 18, 0, 36, H); }
      // dirt toward the hem
      const dg = x.createLinearGradient(0, H, 0, H * 0.6); dg.addColorStop(0, 'rgba(60,45,30,0.35)'); dg.addColorStop(1, 'rgba(60,45,30,0)'); x.fillStyle = dg; x.fillRect(0, H * 0.6, W, H * 0.4);
      if (part === 'torso') {
        // neckline with lacing
        x.fillStyle = hex(trim); x.beginPath(); x.moveTo(front - 50, 0); x.lineTo(front, 110); x.lineTo(front + 50, 0); x.closePath(); x.fill();
        x.fillStyle = hex(o.under ?? 0xd8ccb0); x.beginPath(); x.moveTo(front - 30, 0); x.lineTo(front, 80); x.lineTo(front + 30, 0); x.closePath(); x.fill();
        x.strokeStyle = hex(0x3a2a1a); x.lineWidth = 2; for (let i = 0; i < 4; i++) { const yy = 12 + i * 16, ww = 28 - i * 6; x.beginPath(); x.moveTo(front - ww, yy); x.lineTo(front + ww, yy + 12); x.moveTo(front + ww, yy); x.lineTo(front - ww, yy + 12); x.stroke(); }
        trimBand(x, 0, W, 16, trim, acc, o.motif);
        if (t === 'robe') { trimBand(x, 0, 30, H, trim, acc, o.motif); x.save(); x.translate(front, 0); x.fillStyle = hex(trim); x.fillRect(-14, 110, 28, H); x.fillStyle = hex(acc); for (let yy = 130; yy < H; yy += 26) { x.beginPath(); x.arc(0, yy, 5, 0, 7); x.fill(); } x.restore(); }
        // side seams
        for (const sx of [128, 384]) stitches(x, sx, 0, sx, H, 'rgba(0,0,0,0.35)', 4, 3);
      }
      if (part === 'skirt') { trimBand(x, H - 40, W, 40, trim, acc, o.motif); if (t === 'robe') { x.fillStyle = hex(trim); x.fillRect(front - 14, 0, 28, H - 40); } }
      if (part === 'sleeve') trimBand(x, H - 26, W, 26, trim, acc, o.motif);
    }
    if (o.apron !== undefined && part !== 'sleeve') {
      const aw = 180; x.fillStyle = hex(o.apron); x.fillRect(front - aw / 2, part === 'torso' ? 150 : 0, aw, H);
      mottle(x, W, H, 0.35, 'overlay'); x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2; x.strokeRect(front - aw / 2, part === 'torso' ? 150 : -5, aw, H + 10);
      stitches(x, front - aw / 2 + 6, part === 'torso' ? 156 : 0, front - aw / 2 + 6, H, 'rgba(220,200,160,0.5)'); stitches(x, front + aw / 2 - 6, part === 'torso' ? 156 : 0, front + aw / 2 - 6, H, 'rgba(220,200,160,0.5)');
      for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(20,15,10,${R(0.1, 0.35)})`; x.beginPath(); x.arc(front + R(-80, 80), R(160, H), R(3, 14), 0, 7); x.fill(); } // soot
      if (part === 'torso') { x.strokeStyle = hex(o.apron, 0.8); x.lineWidth = 14; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(front + s * 70, 150); x.lineTo(front + s * 40, 0); x.stroke(); } }
    }
    if (part === 'sleeve' && (t === 'leather' || o.bracers)) {
      x.fillStyle = hex(o.bracers ?? trim); x.fillRect(0, H - 150, W, 120); x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 3; x.strokeRect(-5, H - 150, W + 10, 120);
      for (let i = 0; i < W; i += 40) { x.strokeStyle = 'rgba(210,190,150,0.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(i, H - 140); x.lineTo(i + 20, H - 40); x.stroke(); }
      mottle(x, W, H, 0.2, 'overlay');
    }
    return { c, rough, metal, n, side: part === 'skirt' ? THREE.DoubleSide : THREE.FrontSide };
  });
}

// ------------------------------------------------------------------ legs, boots, gloves
export function pantsMaterial(o) {
  return material('pants' + JSON.stringify(o), () => {
    const W = 256, H = 512, [c, x] = cv(W, H);
    x.fillStyle = hex(o.base ?? 0x4a3b2a); x.fillRect(0, 0, W, H); mottle(x, W, H, 0.3, 'overlay'); weave(x, W, H, 0.1, 3); grain(x, W, H, 2000, 0.05);
    const kn = x.createRadialGradient(W / 2, H * 0.45, 2, W / 2, H * 0.45, 50); kn.addColorStop(0, 'rgba(255,255,255,0.12)'); kn.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = kn; x.fillRect(0, H * 0.3, W, H * 0.3);
    if (o.wraps !== undefined) { // cross-gartered leg wraps on the shin
      x.strokeStyle = hex(o.wraps); x.lineWidth = 10;
      for (let i = -2; i < 8; i++) { x.beginPath(); x.moveTo(i * 40, H * 0.05); x.lineTo(i * 40 + 120, H * 0.42); x.stroke(); x.beginPath(); x.moveTo(i * 40 + 120, H * 0.05); x.lineTo(i * 40, H * 0.42); x.stroke(); }
    }
    if (o.metal) { x.fillStyle = 'rgba(160,165,170,1)'; x.fillRect(0, H * 0.38, W, H * 0.14); for (let i = 10; i < W; i += 40) rivet(x, i, H * 0.45, 3); }
    return { c, rough: 0.9, n: 2.2 };
  });
}
export function bootMaterial(col = 0x3a2a1c) {
  return material('boot' + col, () => {
    const W = 256, H = 256, [c, x] = cv(W, H);
    x.fillStyle = hex(col); x.fillRect(0, 0, W, H); mottle(x, W, H, 0.45, 'overlay'); grain(x, W, H, 1500, 0.06);
    x.fillStyle = hex(col, 0.75); x.fillRect(0, 0, W, 40); stitches(x, 0, 44, W, 44, 'rgba(210,190,150,0.6)');
    x.strokeStyle = 'rgba(200,180,140,0.7)'; x.lineWidth = 2; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(W / 2 - 14, 60 + i * 26); x.lineTo(W / 2 + 14, 72 + i * 26); x.moveTo(W / 2 + 14, 60 + i * 26); x.lineTo(W / 2 - 14, 72 + i * 26); x.stroke(); }
    x.fillStyle = 'rgba(20,15,10,0.6)'; x.fillRect(0, H - 30, W, 30);
    return { c, rough: 0.6, n: 2.5 };
  });
}
export function skinMaterial(col = 0xd9a882, undead = false) {
  return material('skin' + col + undead, () => {
    const W = 256, H = 256, [c, x] = cv(W, H);
    x.fillStyle = hex(col); x.fillRect(0, 0, W, H); mottle(x, W, H, undead ? 0.5 : 0.15, 'overlay'); grain(x, W, H, 1500, 0.03);
    if (undead) { x.strokeStyle = 'rgba(20,15,10,0.5)'; for (let i = 0; i < 40; i++) { let px = rnd() * W, py = rnd() * H; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += R(-12, 12); py += R(-12, 12); x.lineTo(px, py); } x.stroke(); } }
    return { c, rough: undead ? 0.9 : 0.6, n: undead ? 3 : 0.8, bright: 1.25 };
  });
}

// ------------------------------------------------------------------ hair, fur, metal helmets
export function hairMaterial(col) {
  return material('hair' + col, () => {
    const W = 256, H = 256, [c, x] = cv(W, H);
    x.fillStyle = hex(col, 0.75); x.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { const px = rnd() * W, py = rnd() * H, l = R(20, 70); x.strokeStyle = hex(col, R(0.6, 1.45), R(0.3, 0.8)); x.lineWidth = R(0.6, 1.6); x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + R(-6, 6), py + l / 2, px + R(-4, 4), py + l); x.stroke(); }
    return { c, rough: 0.55, n: 2 };
  });
}
export function furMaterial(col, belly, opts = {}) {
  return material('fur' + col + '_' + belly + JSON.stringify(opts), () => {
    const W = 512, H = 256, [c, x] = cv(W, H);
    // capsule lathe UV: u=0/1 faces down (belly), u=0.5 along the back
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, hex(belly)); g.addColorStop(0.3, hex(col)); g.addColorStop(0.5, hex(col, opts.saddle ? 0.55 : 0.9)); g.addColorStop(0.7, hex(col)); g.addColorStop(1, hex(belly));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      const px = rnd() * W, py = rnd() * H, l = R(6, 16), k = R(0.55, 1.45);
      const base = Math.abs(px / W - 0.5) > 0.32 ? belly : col;
      x.strokeStyle = hex(base, k, R(0.25, 0.7)); x.lineWidth = R(0.8, 1.8);
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + R(-2, 2), py + l); x.stroke();
    }
    return { c, rough: 0.95, n: 3, bright: 1.15 };
  });
}
export function helmMaterial(col = 0x8a8a8a, o = {}) {
  return material('helm' + col + JSON.stringify(o), () => {
    const W = 256, H = 256, [c, x] = cv(W, H);
    x.fillStyle = hex(col); x.fillRect(0, 0, W, H); mottle(x, W, H, 0.3, 'overlay');
    for (let i = 0; i < W; i += 2) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; x.fillRect(i, 0, 1, H); }
    // reinforcing bands (cross over the crown) and a brow band
    x.fillStyle = hex(o.band ?? col, 0.7); for (const u of [0, 64, 128, 192]) x.fillRect(u - 6, 0, 12, H);
    x.fillRect(0, H - 40, W, 30); for (let i = 8; i < W; i += 24) rivet(x, i, H - 25, 3);
    if (o.rust) for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(${R(90, 140)},${R(40, 60)},20,${R(0.15, 0.45)})`; x.beginPath(); x.arc(rnd() * W, rnd() * H, R(2, 8), 0, 7); x.fill(); }
    return { c, rough: 0.4, metal: 0.85, n: 2.5 };
  });
}
export function shieldMaterial(o) {
  return material('shield' + JSON.stringify(o), () => {
    const W = 256, H = 256, [c, x] = cv(W, H);
    // planks
    for (let i = 0; i < 5; i++) { x.fillStyle = hex(0x7a5a3a, R(0.8, 1.15)); x.fillRect(i * W / 5, 0, W / 5, H); x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(i * W / 5, 0, 2, H); }
    mottle(x, W, H, 0.4, 'overlay');
    if (o.paint !== undefined) {
      x.fillStyle = hex(o.paint, 1, 0.85);
      if (o.design === 'quarters') { x.fillRect(0, 0, W / 2, H / 2); x.fillRect(W / 2, H / 2, W / 2, H / 2); }
      else if (o.design === 'stripe') { x.fillRect(W / 2 - 30, 0, 60, H); }
      else { x.beginPath(); x.arc(W / 2, H / 2, 70, 0, 7); x.fill(); x.fillStyle = hex(o.accent ?? 0xe8d8b0); for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(W / 2 - 40 + k * 30, H / 2 - 50); x.lineTo(W / 2 - 30 + k * 30, H / 2 + 50); x.lineTo(W / 2 - 22 + k * 30, H / 2 - 50); x.fill(); } }
      mottle(x, W, H, 0.3, 'multiply');
    }
    for (let i = 0; i < 40; i++) { x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 1; x.beginPath(); const px = rnd() * W, py = rnd() * H; x.moveTo(px, py); x.lineTo(px + R(-20, 20), py + R(-20, 20)); x.stroke(); } // gouges
    return { c, rough: 0.8, n: 2.5 };
  });
}

// ------------------------------------------------------------------ dragon
export function scaleMaterial(col = 0x4f6a78, opts = {}) {
  return material('scales' + col + JSON.stringify(opts), () => {
    const W = 512, H = 512, [c, x] = cv(W, H);
    x.fillStyle = hex(col, 0.5); x.fillRect(0, 0, W, H);
    const s = opts.size ?? 22;
    for (let row = -1; row < H / (s * 0.55) + 1; row++) for (let i = -1; i < W / s + 1; i++) {
      const px = i * s + (row % 2 ? s / 2 : 0), py = row * s * 0.55;
      const g = x.createRadialGradient(px, py + s * 0.1, 1, px, py + s * 0.25, s * 0.62);
      const k = R(0.85, 1.2);
      g.addColorStop(0, hex(col, 1.45 * k)); g.addColorStop(0.6, hex(col, 1.0 * k)); g.addColorStop(1, hex(col, 0.45));
      x.fillStyle = g; x.beginPath(); x.moveTo(px - s / 2, py); x.quadraticCurveTo(px - s / 2, py + s * 0.75, px, py + s * 0.85); x.quadraticCurveTo(px + s / 2, py + s * 0.75, px + s / 2, py); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1; x.stroke();
    }
    mottle(x, W, H, 0.3, 'overlay');
    return { c, rough: 0.45, metal: 0.15, n: 3.5 };
  });
}
export function bellyMaterial(col = 0xb8ad92) {
  return material('belly' + col, () => {
    const W = 256, H = 512, [c, x] = cv(W, H);
    x.fillStyle = hex(col); x.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 28) { const g = x.createLinearGradient(0, y, 0, y + 28); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.8, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); x.fillStyle = g; x.fillRect(0, y, W, 28); }
    mottle(x, W, H, 0.35, 'overlay');
    return { c, rough: 0.6, n: 3 };
  });
}
export function wingMaterial(col = 0x5a2e2c) {
  return material('wing' + col, () => {
    const W = 512, H = 512, [c, x] = cv(W, H);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, hex(col, 1.2)); g.addColorStop(1, hex(col, 0.6)); x.fillStyle = g; x.fillRect(0, 0, W, H);
    mottle(x, W, H, 0.4, 'overlay');
    x.strokeStyle = hex(col, 0.45, 0.8);
    for (let i = 0; i < 26; i++) { let px = R(0, W), py = 0; x.lineWidth = R(1, 3); x.beginPath(); x.moveTo(px, py); while (py < H) { px += R(-14, 14); py += R(10, 30); x.lineTo(px, py); } x.stroke(); }
    for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(20,5,5,0.5)'; x.beginPath(); x.ellipse(rnd() * W, rnd() * H, R(2, 7), R(2, 5), 0, 0, 7); x.fill(); } // tears & scars
    return { c, rough: 0.7, n: 2, side: THREE.DoubleSide };
  });
}
export function hornMaterial() {
  return material('horn', () => {
    const W = 128, H = 256, [c, x] = cv(W, H);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f4ecd8'); g.addColorStop(1, '#6a5a44'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 6) { x.fillStyle = `rgba(0,0,0,${R(0.05, 0.2)})`; x.fillRect(0, y, W, 2); }
    mottle(x, W, H, 0.3, 'overlay');
    return { c, rough: 0.5, n: 2 };
  });
}
export function bladeMaterial(col = 0xc8ccd2) {
  return material('blade' + col, () => {
    const W = 128, H = 512, [c, x] = cv(W, H);
    x.fillStyle = hex(col); x.fillRect(0, 0, W, H);
    for (let i = 0; i < H; i += 1) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`; x.fillRect(0, i, W, 1); }
    // fuller (blood groove) down the middle + etched knotwork
    const g = x.createLinearGradient(W / 2 - 14, 0, W / 2 + 14, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(0,0,0,0.35)'); g.addColorStop(0.7, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(W / 2 - 14, 30, 28, H * 0.75);
    x.strokeStyle = 'rgba(40,40,40,0.35)'; x.lineWidth = 1.5; for (let y = 20; y < 110; y += 18) { x.beginPath(); x.arc(W / 2, y, 7, 0, 7); x.stroke(); }
    mottle(x, W, H, 0.15, 'overlay');
    return { c, rough: 0.3, metal: 0.75, n: 1.5 };
  });
}
