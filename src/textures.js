// Procedural, tileable textures generated at load time (no image files needed),
// plus the materials that use them: triplanar world-space mapping with derivative bump
// for static scenery, and UV-mapped cloth/leather/fur/metal for characters.
import * as THREE from 'three';

// ------------------------------------------------------------------ periodic noise
function h2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a, p) => ((a % p) + p) % p;
function vn(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = mod(xi, p), x1 = mod(xi + 1, p), y0 = mod(yi, p), y1 = mod(yi + 1, p);
  const a = h2(x0, y0, s), b = h2(x1, y0, s), c = h2(x0, y1, s), d = h2(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fbm over a [0,1) tile; `f` = base frequency (integer) keeps it tileable
function fbm(u, v, f, oct = 5, s = 0) {
  let sum = 0, amp = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { sum += amp * vn(u * f, v * f, f, s + i * 31); n += amp; amp *= 0.5; f *= 2; }
  return sum / n;
}
// anisotropic fbm (different frequencies on u and v)
function fbm2(u, v, fu, fv, oct = 4, s = 0) {
  let sum = 0, amp = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    const xi = u * fu, yi = v * fv;
    // periodic in both axes with separate periods
    const X = Math.floor(xi), Y = Math.floor(yi), fx = xi - X, fy = yi - Y;
    const uu = fx * fx * (3 - 2 * fx), vv = fy * fy * (3 - 2 * fy);
    const a = h2(mod(X, fu), mod(Y, fv), s + i), b = h2(mod(X + 1, fu), mod(Y, fv), s + i), c = h2(mod(X, fu), mod(Y + 1, fv), s + i), d = h2(mod(X + 1, fu), mod(Y + 1, fv), s + i);
    sum += amp * (a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv); n += amp; amp *= 0.5; fu *= 2; fv *= 2;
  }
  return sum / n;
}
// periodic cellular noise → [F1, F2, cell id]
function cell(u, v, f, s = 0) {
  const x = u * f, y = v * f, X = Math.floor(x), Y = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = X + i, cy = Y + j, wx = mod(cx, f), wy = mod(cy, f);
    const px = cx + h2(wx, wy, s), py = cy + h2(wx, wy, s + 7);
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = h2(wx, wy, s + 13); } else if (d < f2) f2 = d;
  }
  return [f1, f2, id];
}
const cl = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ texture factory
const cache = {};
function make(name, size, fn) {
  if (cache[name]) return cache[name];
  const data = new Uint8Array(size * size * 4), out = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x / size, y / size, out);
    const k = (y * size + x) * 4;
    data[k] = cl(out[0]) * 255; data[k + 1] = cl(out[1]) * 255; data[k + 2] = cl(out[2]) * 255; data[k + 3] = cl(out[3]) * 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
  // separate linear grayscale height texture (for bumpMap on UV-mapped materials)
  const hd = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const h = data[i * 4 + 3]; hd[i * 4] = hd[i * 4 + 1] = hd[i * 4 + 2] = h; hd[i * 4 + 3] = 255; }
  const b = new THREE.DataTexture(hd, size, size, THREE.RGBAFormat);
  b.wrapS = b.wrapT = THREE.RepeatWrapping; b.magFilter = THREE.LinearFilter; b.minFilter = THREE.LinearMipmapLinearFilter; b.generateMipmaps = true; b.needsUpdate = true;
  return (cache[name] = { map: t, bump: b });
}

// RGB in 0..1 (sRGB), A = height
export const TEX = {
  grass: () => make('grass', 512, (u, v, o) => {
    const low = fbm(u, v, 4, 4, 1), blades = fbm2(u, v, 128, 32, 3, 2), clump = fbm(u, v, 16, 3, 3);
    const t = cl(low * 0.9 + clump * 0.3 - 0.1);
    o[0] = mix(0.16, 0.36, t) + blades * 0.1; o[1] = mix(0.27, 0.45, t) + blades * 0.14; o[2] = mix(0.08, 0.14, t) + blades * 0.04;
    const dry = sstep(0.6, 0.8, fbm(u, v, 8, 3, 9)); o[0] += dry * 0.12; o[1] += dry * 0.04;
    o[3] = blades * 0.7 + clump * 0.3;
  }),
  dirt: () => make('dirt', 512, (u, v, o) => {
    const n = fbm(u, v, 8, 5, 4), [f1, , id] = cell(u, v, 48, 5), peb = sstep(0.4, 0.22, f1) * (id > 0.72 ? 1 : 0) * (0.5 + n);
    const fine = fbm(u, v, 64, 3, 6);
    o[0] = 0.33 + n * 0.16 + fine * 0.05; o[1] = 0.25 + n * 0.12 + fine * 0.04; o[2] = 0.17 + n * 0.08 + fine * 0.03;
    o[0] = mix(o[0], 0.42 + id * 0.12, peb * 0.6); o[1] = mix(o[1], 0.38 + id * 0.1, peb * 0.6); o[2] = mix(o[2], 0.33 + id * 0.08, peb * 0.6);
    o[3] = n * 0.5 + fine * 0.2 + peb * 0.5;
  }),
  rock: () => make('rock', 512, (u, v, o) => {
    const n = fbm(u, v, 4, 6, 7), r = 1 - Math.abs(fbm(u, v, 8, 5, 8) * 2 - 1);
    const [f1, f2] = cell(u, v, 6, 9), crack = sstep(0.06, 0.0, f2 - f1);
    const strata = Math.sin((v + n * 0.25) * Math.PI * 2 * 9) * 0.5 + 0.5;
    let g = 0.36 + n * 0.22 + strata * 0.06 + r * 0.08 - crack * 0.22;
    const lichen = sstep(0.62, 0.75, fbm(u, v, 8, 4, 10));
    o[0] = g * 1.02; o[1] = g * 1.0; o[2] = g * 0.95;
    o[0] = mix(o[0], 0.45, lichen * 0.5); o[1] = mix(o[1], 0.5, lichen * 0.5); o[2] = mix(o[2], 0.3, lichen * 0.5);
    o[3] = cl(n * 0.5 + r * 0.4 + strata * 0.1 - crack * 0.6);
  }),
  snow: () => make('snow', 256, (u, v, o) => {
    const n = fbm(u, v, 4, 5, 11), f = fbm(u, v, 32, 3, 12);
    o[0] = 0.86 + n * 0.1; o[1] = 0.9 + n * 0.08; o[2] = 0.97 + n * 0.03; o[3] = n * 0.6 + f * 0.4;
  }),
  sand: () => make('sand', 256, (u, v, o) => {
    const n = fbm(u, v, 4, 4, 13), rip = Math.sin((v * 12 + fbm(u, v, 4, 3, 14) * 3) * Math.PI * 2) * 0.5 + 0.5, f = fbm(u, v, 64, 2, 15);
    o[0] = 0.72 + n * 0.1 + f * 0.06; o[1] = 0.64 + n * 0.09 + f * 0.05; o[2] = 0.46 + n * 0.06 + f * 0.04; o[3] = rip * 0.5 + f * 0.5;
  }),
  planks: () => make('planks', 512, (u, v, o) => {
    const boards = 5, bu = u * boards, bi = Math.floor(bu), fu = bu - bi;
    const id = h2(bi, 0, 21), seam = sstep(0.05, 0.0, Math.min(fu, 1 - fu));
    const grain = fbm2(u, v + id, 160, 6, 4, 22);
    const ring = Math.sin((u * 140 + fbm(u, v, 8, 3, 23) * 6) * 1.0) * 0.5 + 0.5;
    const cross = Math.floor(v * 2 + id * 2) % 2 === 0 ? sstep(0.012, 0, Math.abs(((v * 2 + id * 2) % 1))) : 0;
    let w = 0.36 + id * 0.12 + grain * 0.18 + ring * 0.04;
    w *= 1 - seam * 0.7 - cross * 0.5;
    o[0] = w * 1.02; o[1] = w * 0.84; o[2] = w * 0.66;
    o[3] = cl(0.6 + grain * 0.3 - seam * 0.8 - cross * 0.5);
  }),
  stone: () => make('stone', 512, (u, v, o) => {
    const rows = 6, rv = v * rows, ri = Math.floor(rv), fv = rv - ri;
    const off = h2(ri, 1, 31) * 0.8, cols = 4, cu = u * cols + off, ci = Math.floor(cu), fu = cu - ci;
    const id = h2(mod(ci, cols), ri, 32);
    const edge = Math.min(fu, 1 - fu) * 0.9, edgev = Math.min(fv, 1 - fv);
    const e = Math.min(edge * (cols / rows) * 1.6, edgev) + (fbm(u, v, 16, 3, 33) - 0.5) * 0.06;
    const mortar = sstep(0.05, 0.02, e);
    const n = fbm(u, v, 16, 4, 34);
    const g = 0.38 + id * 0.16 + n * 0.14;
    o[0] = mix(g * 1.0, 0.5, mortar); o[1] = mix(g * 0.98, 0.48, mortar); o[2] = mix(g * 0.93, 0.43, mortar);
    o[3] = cl(mix(0.55 + sstep(0, 0.2, e) * 0.35 + n * 0.1, 0.05, mortar));
  }),
  shingles: () => make('shingles', 512, (u, v, o) => {
    const rows = 12, rv = v * rows, ri = Math.floor(rv), fv = rv - ri;
    const cols = 10, cu = u * cols + (ri % 2) * 0.5, ci = Math.floor(cu), fu = cu - ci;
    const id = h2(mod(ci, cols), mod(ri, rows), 41);
    const gap = sstep(0.06, 0.0, Math.min(fu, 1 - fu));
    const n = fbm2(u, v, 64, 16, 3, 42);
    const shade = 0.55 + fv * 0.45;
    const g = (0.3 + id * 0.12 + n * 0.12) * shade * (1 - gap * 0.6);
    o[0] = g * 1.1; o[1] = g * 0.85; o[2] = g * 0.7;
    o[3] = cl(fv * 0.8 + n * 0.2 - gap * 0.6);
  }),
  bark: () => make('bark', 256, (u, v, o) => {
    const ridges = fbm2(u, v, 24, 3, 4, 51), fine = fbm(u, v, 32, 3, 52);
    const r = sstep(0.35, 0.65, ridges);
    const g = 0.18 + r * 0.16 + fine * 0.08;
    o[0] = g * 1.2; o[1] = g * 0.95; o[2] = g * 0.75; o[3] = r * 0.8 + fine * 0.2;
  }),
  foliage: () => make('foliage', 256, (u, v, o) => {
    const [f1, f2, id] = cell(u, v, 20, 61), n = fbm(u, v, 8, 4, 62);
    const leaf = sstep(0.55, 0.15, f1), edge = sstep(0.0, 0.1, f2 - f1);
    const g = (0.35 + id * 0.35) * leaf * edge + 0.08;
    o[0] = g * 0.55 + n * 0.05; o[1] = g * 0.85 + n * 0.08; o[2] = g * 0.42; o[3] = leaf * edge * 0.8 + n * 0.2;
  }),
  needles: () => make('needles', 256, (u, v, o) => {
    const s = fbm2(u, v, 64, 8, 3, 71), d = fbm(u, v, 8, 4, 72);
    const t = sstep(0.4, 0.7, s) * 0.7 + d * 0.3;
    o[0] = 0.1 + t * 0.2; o[1] = 0.2 + t * 0.32; o[2] = 0.12 + t * 0.16; o[3] = t;
  }),
  cloth: () => make('cloth', 256, (u, v, o) => {
    const w = (Math.sin(u * Math.PI * 2 * 64) * Math.sin(v * Math.PI * 2 * 64)) * 0.5 + 0.5, n = fbm(u, v, 8, 4, 81), f = fbm(u, v, 64, 2, 82);
    const g = 0.72 + w * 0.12 + n * 0.12 + f * 0.06;
    o[0] = g; o[1] = g; o[2] = g; o[3] = w * 0.5 + n * 0.3 + f * 0.2;
  }),
  leather: () => make('leather', 256, (u, v, o) => {
    const [f1, f2] = cell(u, v, 24, 91), n = fbm(u, v, 8, 4, 92);
    const crease = sstep(0.08, 0, f2 - f1), g = 0.72 + n * 0.22 - crease * 0.18;
    o[0] = g; o[1] = g; o[2] = g; o[3] = 0.7 - crease * 0.6 + n * 0.2;
  }),
  fur: () => make('fur', 256, (u, v, o) => {
    const s = fbm2(u, v, 96, 12, 3, 101), n = fbm(u, v, 8, 3, 102);
    const g = 0.55 + s * 0.4 + n * 0.15; o[0] = g; o[1] = g; o[2] = g; o[3] = s;
  }),
  metal: () => make('metal', 256, (u, v, o) => {
    const s = fbm2(u, v, 4, 128, 3, 111), n = fbm(u, v, 8, 3, 112);
    const g = 0.75 + s * 0.15 + n * 0.1; o[0] = g; o[1] = g; o[2] = g; o[3] = s * 0.5;
  }),
  bone: () => make('bone', 256, (u, v, o) => {
    const n = fbm(u, v, 8, 5, 121), [f1, f2] = cell(u, v, 10, 122), c = sstep(0.05, 0, f2 - f1);
    const g = 0.78 + n * 0.15 - c * 0.2; o[0] = g; o[1] = g * 0.95; o[2] = g * 0.82; o[3] = n * 0.7 - c * 0.4 + 0.3;
  }),
};

export function waterNormal() {
  if (cache.waterN) return cache.waterN;
  const size = 256, hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hgt[y * size + x] = fbm(x / size, y / size, 8, 5, 131);
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hx = hgt[y * size + (x + 1) % size] - hgt[y * size + (x - 1 + size) % size];
    const hy = hgt[((y + 1) % size) * size + x] - hgt[((y - 1 + size) % size) * size + x];
    const nx = -hx * 6, ny = -hy * 6, nz = 1, l = Math.hypot(nx, ny, nz), k = (y * size + x) * 4;
    d[k] = (nx / l * 0.5 + 0.5) * 255; d[k + 1] = (ny / l * 0.5 + 0.5) * 255; d[k + 2] = (nz / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (cache.waterN = t);
}

export function cloudTexture() {
  if (cache.clouds) return cache.clouds;
  const size = 512, d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / size, y / size, 4, 6, 141), a = sstep(0.48, 0.75, n), k = (y * size + x) * 4;
    const g = 230 + n * 25; d[k] = g; d[k + 1] = g; d[k + 2] = g + 5; d[k + 3] = a * 235;
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (cache.clouds = t);
}

// ------------------------------------------------------------------ shader snippets
const TRI_VERT_DECL = 'varying vec3 vWPos; varying vec3 vWNorm;';
const TRI_VERT = `
  vec4 twp = vec4(transformed, 1.0); vec3 twn = objectNormal;
  #ifdef USE_INSTANCING
    twp = instanceMatrix * twp; twn = mat3(instanceMatrix) * twn;
  #endif
  twp = modelMatrix * twp; vWPos = twp.xyz; vWNorm = normalize(mat3(modelMatrix) * twn);`;
export const BUMP_FN = `
vec3 dBump(vec3 n, float h, float k) {
  vec2 dH = vec2(dFdx(h), dFdy(h)) * k;
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx); float det = dot(sx, r1);
  return normalize(abs(det) * n - sign(det) * (dH.x * r1 + dH.y * r2));
}`;

// Triplanar world-space textured standard material (for scenery: no UV stretching).
const triCache = new Map();
export function triMat(kind, color = 0xffffff, o = {}) {
  const key = kind + color + JSON.stringify(o);
  if (triCache.has(key)) return triCache.get(key);
  const tex = TEX[kind]().map;
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.92, metalness: o.metalness ?? 0, emissive: o.emissive ?? 0, side: o.side ?? THREE.FrontSide });
  const scale = o.scale ?? 0.35, bump = o.bump ?? 1.2;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.triMap = { value: tex }; sh.uniforms.triScale = { value: scale }; sh.uniforms.triBump = { value: bump };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TRI_VERT_DECL)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + TRI_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      ${TRI_VERT_DECL} uniform sampler2D triMap; uniform float triScale; uniform float triBump; ${BUMP_FN}
      vec4 triSample(vec3 p, vec3 n) {
        vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x + b.y + b.z);
        return texture2D(triMap, p.zy * triScale) * b.x + texture2D(triMap, p.xz * triScale) * b.y + texture2D(triMap, p.xy * triScale) * b.z;
      }`)
      .replace('#include <map_fragment>', 'vec4 triC = triSample(vWPos, normalize(vWNorm)); diffuseColor.rgb *= triC.rgb * 1.6;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = dBump(normal, triC.a, triBump);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= mix(1.08, 0.82, triC.a);');
  };
  m.customProgramCacheKey = () => 'tri';
  triCache.set(key, m);
  return m;
}

// UV-mapped textured materials (characters, foliage, props)
const uvCache = new Map();
export function uvMat(kind, color = 0xffffff, o = {}) {
  const key = kind + color + JSON.stringify(o);
  if (uvCache.has(key)) return uvCache.get(key);
  const t = TEX[kind]();
  const map = o.repeat ? t.map.clone() : t.map, bump = o.repeat ? t.bump.clone() : t.bump;
  if (o.repeat) { map.repeat.set(o.repeat, o.repeat); bump.repeat.set(o.repeat, o.repeat); map.needsUpdate = bump.needsUpdate = true; }
  const m = new THREE.MeshStandardMaterial({ color, map, bumpMap: bump, bumpScale: o.bump ?? 1.5, roughness: o.roughness ?? 0.9, metalness: o.metalness ?? 0,
    emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide, vertexColors: !!o.vertexColors });
  uvCache.set(key, m);
  return m;
}

export function swordMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xc8ccd2, map: TEX.metal().map, roughness: 0.28, metalness: 0.9 });
}
