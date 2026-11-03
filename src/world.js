import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from './state.js';
import { fbm, noise2, smoothstep, lerp, clamp, rng, distToSeg } from './util.js';
import { LOCATIONS, ROADS, CHESTS, HERBS, STONES } from './data.js';
import { mat, box } from './models.js';
import { TEX, triMat, uvMat, waterNormal, cloudTexture, BUMP_FN } from './textures.js';

export const HALF = 300, SEG = 300, STEP = (HALF * 2) / SEG, N = SEG + 1;
export const WATER = 0;
const H = new Float32Array(N * N);

// ------------------------------------------------------------------ height field
const gauss = (x, z, cx, cz, s) => { const dx = x - cx, dz = z - cz; return Math.exp(-(dx * dx + dz * dz) / (2 * s * s)); };
function baseHeight(x, z) {
  let h = fbm(x * 0.0075 + 10, z * 0.0075 + 10, 5) * 34 - 9;
  h += (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 3;
  h += 92 * gauss(x, z, 170, -170, 50);      // Frostspire
  h += 30 * gauss(x, z, 215, -95, 30);
  h += 34 * gauss(x, z, -60, -195, 28);      // Windward hill
  h += 22 * gauss(x, z, -215, -185, 40);
  h += 24 * gauss(x, z, 235, 205, 45);
  h -= 19 * gauss(x, z, -110, 70, 30);       // lake basin
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 225) h += (e - 225) * (1.0 + fbm(x * 0.02, z * 0.02, 3) * 1.2);
  return h;
}
const FLATS = [
  { x: 0, z: 0, r: 52, min: 3 }, { x: 130, z: 120, r: 30, min: 2 }, { x: -150, z: -120, r: 32, min: 2 },
  { x: -40, z: 150, r: 16, min: 2 }, { x: 200, z: 40, r: 15, min: 2 }, { x: 70, z: -55, r: 15, min: 2 },
  { x: 170, z: -170, r: 28, off: -4 }, { x: -60, z: -195, r: 15, off: -1 },
];
for (const f of FLATS) f.t = Math.max(baseHeight(f.x, f.z) + (f.off ?? 0), f.min ?? -99);

function heightFn(x, z) {
  let h = baseHeight(x, z);
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r) h = lerp(h, f.t, smoothstep(f.r, f.r * 0.55, d));
  }
  // roads become raised causeways where they cross low ground or water
  if (h < 1.5) { const rd = roadDist(x, z); if (rd < 7) h = lerp(h, 1.4, smoothstep(7, 3.5, rd)); }
  return h;
}

export function ground(x, z) {
  const gx = clamp((x + HALF) / STEP, 0, SEG - 0.0001), gz = clamp((z + HALF) / STEP, 0, SEG - 0.0001);
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const h00 = H[j * N + i], h10 = H[j * N + i + 1], h01 = H[(j + 1) * N + i], h11 = H[(j + 1) * N + i + 1];
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

export function roadDist(x, z) {
  let d = 1e9;
  for (const r of ROADS) for (let k = 0; k < r.length - 1; k++) d = Math.min(d, distToSeg(x, z, r[k][0], r[k][1], r[k + 1][0], r[k + 1][1]));
  return d;
}

// ------------------------------------------------------------------ colliders
const CELL = 16, cells = new Map();
const ckey = (cx, cz) => cx * 10007 + cz;
function insert(c, minx, maxx, minz, maxz) {
  for (let cx = Math.floor((minx - 2) / CELL); cx <= Math.floor((maxx + 2) / CELL); cx++)
    for (let cz = Math.floor((minz - 2) / CELL); cz <= Math.floor((maxz + 2) / CELL); cz++) {
      const k = ckey(cx, cz); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(c);
    }
}
export function addCircle(x, z, r) { const c = { t: 0, x, z, r }; insert(c, x - r, x + r, z - r, z + r); return c; }
export function addBox(x, z, hw, hd) { const c = { t: 1, x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd }; insert(c, c.x0, c.x1, c.z0, c.z1); return c; }

export function resolveCollision(pos, r) {
  const list = cells.get(ckey(Math.floor(pos.x / CELL), Math.floor(pos.z / CELL)));
  let hit = false;
  if (list) for (const c of list) {
    if (c.dead) continue;
    if (c.t === 0) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-5) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; hit = true; }
    } else {
      const cx = clamp(pos.x, c.x0, c.x1), cz = clamp(pos.z, c.z0, c.z1);
      const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
      if (d < r) {
        hit = true;
        if (d > 1e-5) { pos.x = cx + dx / d * r; pos.z = cz + dz / d * r; }
        else { // inside the box: push out along the shallowest axis
          const pens = [pos.x - c.x0, c.x1 - pos.x, pos.z - c.z0, c.z1 - pos.z];
          const m = Math.min(...pens), i = pens.indexOf(m);
          if (i === 0) pos.x = c.x0 - r; else if (i === 1) pos.x = c.x1 + r; else if (i === 2) pos.z = c.z0 - r; else pos.z = c.z1 + r;
        }
      }
    }
  }
  const lim = HALF - 6;
  pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim);
  return hit;
}

// ------------------------------------------------------------------ terrain surface weights
// [grass, dirt, rock, sand, snow] for a point — shared by the terrain shader, grass placement and the map.
const GW = new Float32Array(N * N); // grass weight per terrain vertex (for grass placement)
export function surfaceWeights(x, z, h, ny, out) {
  const n = noise2(x * 0.12, z * 0.12), f = fbm(x * 0.01, z * 0.01, 3);
  let sand = smoothstep(1.5, 0.7, h);
  let dirt = 0;
  const rd = roadDist(x, z);
  dirt = Math.max(dirt, smoothstep(3.4 + n, 1.8 + n, rd));
  dirt = Math.max(dirt, smoothstep(10 + n * 3, 6, Math.hypot(x, z)) * 0.9);
  dirt = Math.max(dirt, smoothstep(22, 14, Math.hypot(x - 130, z - 120)) * 0.85);
  dirt = Math.max(dirt, smoothstep(0.62, 0.72, f) * 0.6);
  if (h < -0.8) { dirt = 1; sand = 0; }
  let rock = smoothstep(0.86, 0.7, ny);
  rock = Math.max(rock, smoothstep(24, 18, Math.hypot(x + 150, z + 120)) * 0.55 * (n > 0.4 ? 1 : 0.6));
  rock = Math.max(rock, smoothstep(45, 70, h) * 0.5 * n);
  const sl = 50 + n * 12;
  const snow = smoothstep(sl, sl + 6, h) * (ny < 0.72 ? 0.35 : 1);
  const grass = Math.max(0, 1 - sand - dirt);
  out[0] = grass * (1 - rock) * (1 - snow); out[1] = dirt * (1 - rock) * (1 - snow); out[2] = rock * (1 - snow * 0.7);
  out[3] = sand * (1 - rock) * (1 - snow); out[4] = snow;
  const s = out[0] + out[1] + out[2] + out[3] + out[4] || 1;
  for (let i = 0; i < 5; i++) out[i] /= s;
  return out;
}

function buildTerrain(scene) {
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = heightFn(-HALF + i * STEP, -HALF + j * STEP);
  const pos = new Float32Array(N * N * 3), splatA = new Float32Array(N * N * 4), splatB = new Float32Array(N * N);
  const w = [0, 0, 0, 0, 0];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = -HALF + i * STEP, z = -HALF + j * STEP, h = H[k];
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    const hx = H[j * N + Math.min(i + 1, SEG)] - H[j * N + Math.max(i - 1, 0)], hz = H[Math.min(j + 1, SEG) * N + i] - H[Math.max(j - 1, 0) * N + i];
    const ny = 1 / Math.sqrt(1 + (hx / (2 * STEP)) ** 2 + (hz / (2 * STEP)) ** 2);
    surfaceWeights(x, z, h, ny, w);
    splatA[k * 4] = w[0]; splatA[k * 4 + 1] = w[1]; splatA[k * 4 + 2] = w[2]; splatA[k * 4 + 3] = w[3]; splatB[k] = w[4];
    GW[k] = h > 0.6 ? w[0] : 0;
  }
  const idx = new Uint32Array(SEG * SEG * 6); let p = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * N + i, b = (j + 1) * N + i, c = j * N + i + 1, d = (j + 1) * N + i + 1;
    idx[p++] = a; idx[p++] = b; idx[p++] = c; idx[p++] = c; idx[p++] = b; idx[p++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('splatA', new THREE.BufferAttribute(splatA, 4));
  geo.setAttribute('splatB', new THREE.BufferAttribute(splatB, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const T = { tGrass: TEX.grass().map, tDirt: TEX.dirt().map, tRock: TEX.rock().map, tSand: TEX.sand().map, tSnow: TEX.snow().map };
  m.onBeforeCompile = (sh) => {
    for (const k in T) sh.uniforms[k] = { value: T[k] };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splatA; attribute float splatB; varying vec4 vSA; varying float vSB; varying vec3 vWPos; varying vec3 vWNorm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vSA = splatA; vSB = splatB; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNorm = objectNormal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tDirt, tRock, tSand, tSnow; varying vec4 vSA; varying float vSB; varying vec3 vWPos; varying vec3 vWNorm;
        ${BUMP_FN}
        vec4 s2(sampler2D t, vec2 p) { return mix(texture2D(t, p * 0.28), texture2D(t, p * 0.061 + 0.37), 0.4); }
        vec4 rockTri(vec3 p, vec3 n) { vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x + b.y + b.z);
          return texture2D(tRock, p.zy * 0.11) * b.x + texture2D(tRock, p.xz * 0.11) * b.y + texture2D(tRock, p.xy * 0.11) * b.z; }`)
      .replace('#include <map_fragment>', `
        vec2 tp = vWPos.xz;
        vec4 cg = s2(tGrass, tp), cd = s2(tDirt, tp), cr = rockTri(vWPos, normalize(vWNorm)), csa = s2(tSand, tp), csn = s2(tSnow, tp);
        // height-aware blending gives crisp, natural transitions
        float w0 = vSA.x + cg.a * 0.45, w1 = vSA.y + cd.a * 0.45, w2 = vSA.z + cr.a * 0.45, w3 = vSA.w + csa.a * 0.45, w4 = vSB + csn.a * 0.45;
        w0 *= step(0.001, vSA.x); w1 *= step(0.001, vSA.y); w2 *= step(0.001, vSA.z); w3 *= step(0.001, vSA.w); w4 *= step(0.001, vSB);
        float mx = max(max(max(w0, w1), max(w2, w3)), w4) - 0.22;
        w0 = max(w0 - mx, 0.0); w1 = max(w1 - mx, 0.0); w2 = max(w2 - mx, 0.0); w3 = max(w3 - mx, 0.0); w4 = max(w4 - mx, 0.0);
        float ws = w0 + w1 + w2 + w3 + w4 + 1e-4;
        vec4 tc = (cg * w0 + cd * w1 + cr * w2 + csa * w3 + csn * w4) / ws;
        float macro = texture2D(tGrass, tp * 0.0045).g;
        tc.rgb *= mix(0.82, 1.18, smoothstep(0.3, 0.48, macro));
        diffuseColor.rgb = tc.rgb * 1.25;
        float tSnowW = w4 / ws;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = dBump(normal, tc.a, 0.85 * (1.0 - smoothstep(20.0, 90.0, length(vViewPosition))));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.96, 0.55, tSnowW) * mix(1.05, 0.85, tc.a);');
  };
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // water: reflective, with scrolling normals
  const wn = waterNormal(); wn.repeat.set(60, 60);
  const wgeo = new THREE.PlaneGeometry(HALF * 2.4, HALF * 2.4, 1, 1); wgeo.rotateX(-Math.PI / 2);
  waterMat = new THREE.MeshStandardMaterial({ color: 0x1d4656, roughness: 0.05, metalness: 0.15, normalMap: wn, normalScale: new THREE.Vector2(0.28, 0.28), transparent: true, opacity: 0.88 });
  const water = new THREE.Mesh(wgeo, waterMat); water.position.y = WATER; water.receiveShadow = true; scene.add(water);
}
let waterMat;

// ------------------------------------------------------------------ helpers for scenery
function footprintBase(x, z, hw, hd) {
  return Math.min(ground(x - hw, z - hd), ground(x + hw, z - hd), ground(x - hw, z + hd), ground(x + hw, z + hd), ground(x, z));
}
function roofGeo(span, length, rh) {
  const s = new THREE.Shape(); s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); s.lineTo(0, rh); s.lineTo(-span / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false }); g.translate(0, 0, -length / 2); return g;
}
function addMesh(parent, mesh, x, y, z) { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; }
const M = {
  planks: (c = 0xe0d0c0) => triMat('planks', c, { scale: 0.32 }),
  logs: (c = 0xd8c8b8) => triMat('bark', c, { scale: 0.6, bump: 1.6 }),
  stone: (c = 0xe8e4dc) => triMat('stone', c, { scale: 0.3, bump: 1.6 }),
  rock: (c = 0xd8d4cc) => triMat('rock', c, { scale: 0.18, bump: 1.6 }),
  roof: (c = 0xd0b8a8) => triMat('shingles', c, { scale: 0.42, bump: 1.8 }),
  bone: (c = 0xf0e8d8) => triMat('bone', c, { scale: 0.6 }),
  iron: (c = 0x555555) => uvMat('metal', c, { roughness: 0.45, metalness: 0.8, bump: 0.3 }),
  cloth: (c) => uvMat('cloth', c, { side: THREE.DoubleSide, repeat: 3 }),
};
const roofTint = { 0x4a3326: 0xb09080, 0x6b3b2a: 0xd09a80, 0x3d4a3a: 0x98a890, 0x4a4a4a: 0xa8a8a8, 0x5b3b2a: 0xc8a898, 0x3a4a2a: 0xa0b088 };

function house(scene, x, z, w, d, h, o = {}) {
  const g = new THREE.Group(); scene.add(g);
  const base = footprintBase(x, z, w / 2, d / 2) - 0.2;
  addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 2.2, d + 0.5), M.stone()), x, base - 0.4, z);           // stone footing
  addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.planks(o.wall ?? 0xe0d0c0)), x, base + 0.7 + h / 2, z); // plank walls
  const top = base + 0.7 + h;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    addMesh(g, new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, h + 0.4, 8), M.logs()), x + sx * w / 2, base + 0.7 + h / 2, z + sz * d / 2);
  // timber beams along the top
  addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.35, 0.35), M.logs(0xb8a898)), x, top - 0.1, z + d / 2);
  addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.35, 0.35), M.logs(0xb8a898)), x, top - 0.1, z - d / 2);
  addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, d + 0.3), M.logs(0xb8a898)), x + w / 2, top - 0.1, z);
  addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, d + 0.3), M.logs(0xb8a898)), x - w / 2, top - 0.1, z);
  const ridgeX = w >= d;
  const roof = new THREE.Mesh(roofGeo((ridgeX ? d : w) + 1.6, (ridgeX ? w : d) + 1.4, h * 0.75), M.roof(roofTint[o.roof] ?? 0xc8a898));
  roof.position.set(x, top, z); if (ridgeX) roof.rotation.y = Math.PI / 2; roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
  // ridge beam
  const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, (ridgeX ? w : d) + 1.6, 6), M.logs(0x9a8878)); rb.rotation[ridgeX ? 'z' : 'x'] = Math.PI / 2;
  addMesh(g, rb, x, top + h * 0.75, z);
  // door + windows face the village centre
  const dx = -x, dz = -z, alongX = Math.abs(dx) > Math.abs(dz);
  const sgn = alongX ? Math.sign(dx) : Math.sign(dz);
  const fx = (off) => x + (alongX ? sgn * (w / 2 + 0.06) : off), fz = (off) => z + (alongX ? off : sgn * (d / 2 + 0.06));
  addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.14 : 1.5, 2.3, alongX ? 1.5 : 0.14), M.planks(0x9a7a64)), fx(0), base + 0.7 + 1.15, fz(0));
  addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.22 : 1.9, 0.25, alongX ? 1.9 : 0.22), M.logs(0x9a8878)), fx(0), base + 0.7 + 2.4, fz(0));
  for (const off of [-1, 1]) {
    const along = (alongX ? d : w) * 0.3 * off;
    const wy = base + 0.7 + h * 0.58;
    addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.08 : 1.1, 1.0, alongX ? 1.1 : 0.08), M.logs(0x8a7868)), fx(along), wy, fz(along));       // frame (flush)
    addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.12 : 0.8, 0.72, alongX ? 0.8 : 0.12), mat(0xffd090, { emissive: 0xffa040, ei: 2.2 })), fx(along) + (alongX ? sgn * 0.03 : 0), wy, fz(along) + (alongX ? 0 : sgn * 0.03));
    addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.14 : 0.06, 0.72, alongX ? 0.06 : 0.14), M.logs(0x6a5848)), fx(along) + (alongX ? sgn * 0.05 : 0), wy, fz(along) + (alongX ? 0 : sgn * 0.05));   // mullion
  }
  if (o.chimney) addMesh(g, new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.2, 0.9), M.stone()), x + w * 0.25, top + 1.2, z);
  addBox(x, z, w / 2 + 0.3, d / 2 + 0.3);
  return { g, base };
}

function torch(scene, x, z, h = 2.6) {
  const y = ground(x, z);
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 6), M.logs()), x, y + h / 2, z);
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.25, 8), M.iron()), x, y + h, z);
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), mat(0xffaa44, { basic: true })); f.position.set(x, y + h + 0.3, z); scene.add(f);
  G.flames.push(f);
}

function campfire(scene, x, z, color = 0xff7a2a, withLight = true) {
  const y = ground(x, z);
  for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.3, 6), M.logs(0x8a7060)); l.rotation.set(Math.PI / 2 - 0.35, i * Math.PI * 2 / 5, 0, 'YXZ'); addMesh(scene, l, x, y + 0.3, z); }
  for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), M.rock()); addMesh(scene, s, x + Math.cos(i / 9 * 6.28) * 0.95, y + 0.1, z + Math.sin(i / 9 * 6.28) * 0.95); }
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 7), mat(color, { basic: true })); f.position.set(x, y + 0.7, z); scene.add(f); G.flames.push(f);
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 6), mat(0xffe08a, { basic: true })); f2.position.set(x, y + 0.55, z); scene.add(f2); G.flames.push(f2);
  if (withLight) { const L = new THREE.PointLight(color, 40, 26, 2); L.position.set(x, y + 2, z); scene.add(L); G.lights.push({ l: L, base: 40 }); }
  addCircle(x, z, 1.0);
}

function chestMesh(scene, x, z, rotY = 0) {
  const g = new THREE.Group(); const y = ground(x, z);
  g.position.set(x, y, z); g.rotation.y = rotY; scene.add(g);
  const wood = M.planks(0xc8a080);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), wood); b.position.y = 0.3; b.castShadow = true; g.add(b);
  const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.4); g.add(lid);
  const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12, 1, false, 0, Math.PI), wood); lm.rotation.z = Math.PI / 2; lm.position.set(0, 0, 0.4); lm.castShadow = true; lid.add(lm);
  for (const sx of [-0.45, 0.45]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.84), M.iron(0x8a7040)); band.position.set(sx, 0.3, 0); g.add(band);
    const lb = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.03, 4, 12, Math.PI), M.iron(0x8a7040)); lb.rotation.y = Math.PI / 2; lb.position.set(sx, 0, 0.4); lid.add(lb);
  }
  addBox(x, z, 0.6, 0.6);
  return { g, lid };
}

// ------------------------------------------------------------------ vegetation
function jitter(geo, amt, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = noise2(x * 2.1 + seed + z * 1.3, y * 2.3 + z * 0.7) - 0.5;
    p.setXYZ(i, x * (1 + n * amt), y + n * amt * 0.5, z * (1 + n * amt));
  }
  geo.computeVertexNormals();
  return geo;
}
function treeGeos() {
  const pine = [];
  for (let k = 0; k < 6; k++) {
    const r = 2.3 - k * 0.34, c = new THREE.ConeGeometry(r, 2.2, 10, 2, true);
    jitter(c, 0.35, k * 3.1); c.translate(0, 2.0 + k * 1.05, 0); pine.push(c);
  }
  const pineGeo = mergeGeometries(pine);
  const blobs = [];
  const R = rng(7);
  for (let k = 0; k < 7; k++) {
    const b = new THREE.IcosahedronGeometry(1.0 + R() * 0.6, 1); jitter(b, 0.3, k);
    b.translate((R() - 0.5) * 2.4, 3.4 + R() * 1.6, (R() - 0.5) * 2.4); blobs.push(b);
  }
  const roundGeo = mergeGeometries(blobs);
  const trunk = new THREE.CylinderGeometry(0.2, 0.34, 2.8, 8, 3); jitter(trunk, 0.15, 9); trunk.translate(0, 1.3, 0);
  const rock = new THREE.IcosahedronGeometry(1, 3);
  const rp = rock.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(rp, i);
    const n = fbm(v.x * 1.3 + 5, v.z * 1.3 + v.y * 0.8, 4) - 0.5;
    v.multiplyScalar(1 + n * 0.7); v.y *= v.y < 0 ? 0.5 : 0.85; rp.setXYZ(i, v.x, v.y, v.z);
  }
  rock.computeVertexNormals();
  const bush = new THREE.IcosahedronGeometry(0.85, 1); jitter(bush, 0.4, 4); bush.translate(0, 0.45, 0);
  return { pineGeo, roundGeo, trunk, rock, bush };
}

function scatterVegetation(scene) {
  const R = rng(1337);
  const { pineGeo, roundGeo, trunk, rock, bush } = treeGeos();
  const MAX = 1700;
  const pine = new THREE.InstancedMesh(pineGeo, uvMat('needles', 0xffffff, { repeat: 3, bump: 2.5, side: THREE.DoubleSide }), MAX);
  const round = new THREE.InstancedMesh(roundGeo, uvMat('foliage', 0xffffff, { repeat: 2, bump: 2.5 }), 500);
  const trunks = new THREE.InstancedMesh(trunk, uvMat('bark', 0xffffff, { repeat: 1, bump: 3 }), MAX + 500);
  const rocks = new THREE.InstancedMesh(rock, M.rock(0xd0ccc4), 420);
  const bushes = new THREE.InstancedMesh(bush, uvMat('foliage', 0xffffff, { repeat: 1, bump: 2 }), 700);
  for (const m of [pine, round, trunks, rocks, bushes]) { m.castShadow = true; m.receiveShadow = true; }

  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler(), col = new THREE.Color();
  let np = 0, nr = 0, nt = 0, nk = 0, nb = 0;
  const blocked = (x, z, pad) => {
    for (const k in LOCATIONS) { if (k === 'lake') continue; const L = LOCATIONS[k]; if (Math.hypot(x - L.x, z - L.z) < L.r + pad) return true; }
    return roadDist(x, z) < 3.5 + pad * 0.3;
  };
  const slope = (x, z) => Math.abs(ground(x + 1, z) - ground(x - 1, z)) + Math.abs(ground(x, z + 1) - ground(x, z - 1));

  for (let t = 0; t < 14000 && (np < MAX || nr < 500); t++) {
    const x = (R() * 2 - 1) * (HALF - 8), z = (R() * 2 - 1) * (HALF - 8);
    const h = ground(x, z);
    if (h < 0.8 || h > 66 || slope(x, z) > 2.2 || blocked(x, z, 4)) continue;
    const dens = fbm(x * 0.012 + 3, z * 0.012 + 7, 3);
    if (dens < 0.47 && R() > 0.06) continue;
    const s = 0.75 + R() * 0.75;
    const isRound = h < 18 && R() < 0.28;
    if (isRound && nr >= 500) continue; if (!isRound && np >= MAX) continue;
    Q.setFromEuler(E.set((R() - 0.5) * 0.08, R() * 6.28, (R() - 0.5) * 0.08)); S.set(s, s * (0.9 + R() * 0.35), s); P.set(x, h - 0.25, z); Mx.compose(P, Q, S);
    trunks.setMatrixAt(nt++, Mx);
    if (isRound) { col.setHSL(0.2 + R() * 0.1, 0.5, 0.55 + R() * 0.2); round.setMatrixAt(nr, Mx); round.setColorAt(nr++, col); }
    else {
      const snowy = h > 44; col.setHSL(0.3 + R() * 0.06, snowy ? 0.12 : 0.35, snowy ? 0.85 : 0.62 + R() * 0.2);
      pine.setMatrixAt(np, Mx); pine.setColorAt(np++, col);
    }
    addCircle(x, z, 0.45 * s);
  }
  for (let t = 0; t < 4000 && nk < 420; t++) {
    const x = (R() * 2 - 1) * (HALF - 5), z = (R() * 2 - 1) * (HALF - 5);
    const h = ground(x, z); if (blocked(x, z, 1)) continue;
    const big = R() < 0.25, s = big ? 1.5 + R() * 2.4 : 0.3 + R() * 0.8;
    if (slope(x, z) < 1.2 && R() < 0.5) continue;
    Q.setFromEuler(E.set(R() * 0.6, R() * 6.28, R() * 0.6)); S.set(s, s * (0.7 + R() * 0.5), s * (0.8 + R() * 0.4)); P.set(x, h + s * 0.15, z); Mx.compose(P, Q, S);
    col.setHSL(0.08, 0.05, 0.8 + R() * 0.2); rocks.setMatrixAt(nk, Mx); rocks.setColorAt(nk++, col);
    if (big) addCircle(x, z, s * 0.85);
  }
  for (let t = 0; t < 6000 && nb < 700; t++) {
    const x = (R() * 2 - 1) * (HALF - 5), z = (R() * 2 - 1) * (HALF - 5);
    const h = ground(x, z); if (h < 0.8 || h > 40 || blocked(x, z, 0)) continue;
    const s = 0.5 + R() * 0.9; Q.setFromEuler(E.set(0, R() * 6, 0)); S.set(s, s * 0.8, s); P.set(x, h - 0.1, z); Mx.compose(P, Q, S);
    col.setHSL(0.22 + R() * 0.1, 0.45, 0.55 + R() * 0.2); bushes.setMatrixAt(nb, Mx); bushes.setColorAt(nb++, col);
  }
  pine.count = np; round.count = nr; trunks.count = nt; rocks.count = nk; bushes.count = nb;
  scene.add(pine, round, trunks, rocks, bushes);
}

// ------------------------------------------------------------------ grass field (follows the player)
let GRASS_N = 36000, GRASS_R = 30;
let grass, grassCenter = new THREE.Vector2(1e9, 1e9), grassUniforms = { gTime: { value: 0 } };
function buildGrass(scene) {
  if (G.low) { GRASS_N = 12000; GRASS_R = 20; }
  // a tapered blade with 3 segments; normals point up so blades shade like the ground
  const pos = [], nrm = [], ys = [0, 0.35, 0.7, 1];
  for (let i = 0; i < 3; i++) {
    const y0 = ys[i], y1 = ys[i + 1], w0 = 0.05 * (1 - y0), w1 = 0.05 * (1 - y1);
    const b = (y) => (y * y) * 0.12;
    pos.push(-w0, y0, b(y0), w0, y0, b(y0), w1, y1, b(y1), -w0, y0, b(y0), w1, y1, b(y1), -w1, y1, b(y1));
  }
  for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.gTime = grassUniforms.gTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float gTime; varying float vH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vH = position.y;
        vec4 iw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float wind = sin(gTime * 1.7 + iw.x * 0.31 + iw.z * 0.23) * 0.6 + sin(gTime * 3.3 + iw.x * 0.8 - iw.z * 0.5) * 0.25;
        transformed.x += wind * position.y * position.y * 0.22; transformed.z += wind * position.y * position.y * 0.1;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <map_fragment>', 'diffuseColor.rgb *= mix(0.35, 1.0, vH);')
      // both faces of a blade use the ground's up-normal, so blades never render black from behind
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
  };
  grass = new THREE.InstancedMesh(geo, m, GRASS_N);
  grass.receiveShadow = true; grass.frustumCulled = false; grass.count = 0;
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(grass);
}
const ghash = (x, z, s) => { let h = (Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ Math.imul(s, 83492791)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
function placeGrass(cx, cz) {
  const sp = (GRASS_R * 2) / Math.sqrt(GRASS_N);
  const gx0 = Math.floor((cx - GRASS_R) / sp), gz0 = Math.floor((cz - GRASS_R) / sp), cnt = Math.ceil(GRASS_R * 2 / sp);
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let n = 0;
  for (let j = 0; j < cnt && n < GRASS_N; j++) for (let i = 0; i < cnt && n < GRASS_N; i++) {
    const gi = gx0 + i, gj = gz0 + j;
    const x = (gi + ghash(gi, gj, 1)) * sp, z = (gj + ghash(gi, gj, 2)) * sp;
    const d = Math.hypot(x - cx, z - cz); if (d > GRASS_R) continue;
    const vi = Math.round((x + HALF) / STEP), vj = Math.round((z + HALF) / STEP);
    const gw = GW[vj * N + vi] ?? 0;
    if (gw < 0.35 + ghash(gi, gj, 3) * 0.4) continue;
    const h = ground(x, z);
    const fade = 1 - smoothstep(GRASS_R * 0.7, GRASS_R, d);
    const flower = ghash(gi, gj, 5) < 0.015;
    const s = (0.35 + ghash(gi, gj, 4) * 0.55) * fade * Math.min(1, gw * 1.3) * (flower ? 0.7 : 1);
    Q.setFromAxisAngle(Y, ghash(gi, gj, 6) * 6.28); S.set(1 + s * 0.5, s, 1); P.set(x, h - 0.02, z); Mx.compose(P, Q, S);
    grass.setMatrixAt(n, Mx);
    if (flower) col.setHex([0xf2e05a, 0xf4f4f0, 0xb07ad8, 0xe86a5a][Math.floor(ghash(gi, gj, 7) * 4)]);
    else col.setHSL(0.22 + ghash(gi, gj, 8) * 0.06, 0.62, 0.13 + ghash(gi, gj, 9) * 0.06 + noise2(x * 0.05, z * 0.05) * 0.05);
    grass.setColorAt(n++, col);
  }
  grass.count = n;
  grass.instanceMatrix.needsUpdate = true; if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
}

// ------------------------------------------------------------------ locations
function buildAshvale(scene) {
  const wy = ground(0, 0);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.55, 1.0, 16, 1, true), triMat('stone', 0xe8e4dc, { scale: 0.6, side: THREE.DoubleSide })); addMesh(scene, ring, 0, wy + 0.5, 0);
  addMesh(scene, new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.15, 6, 20), M.stone()), 0, wy + 1.0, 0).rotation.x = Math.PI / 2;
  addMesh(scene, new THREE.Mesh(new THREE.CircleGeometry(1.35, 16), mat(0x0a1418, { roughness: 0.1 })), 0, wy + 0.3, 0).rotation.x = -Math.PI / 2;
  for (const sx of [-1, 1]) addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6), M.logs()), sx * 1.3, wy + 1.3, 0);
  const wr = new THREE.Mesh(roofGeo(2.4, 3.4, 1.0), M.roof()); wr.rotation.y = Math.PI / 2; addMesh(scene, wr, 0, wy + 2.5, 0);
  addCircle(0, 0, 1.6);

  house(scene, 0, -26, 18, 10, 5.5, { roof: 0x4a3326, chimney: true });
  house(scene, -24, -6, 10, 12, 5, { roof: 0x6b3b2a, chimney: true });
  house(scene, 24, -8, 8, 8, 4, { roof: 0x3d4a3a, wall: 0xd0c8b8 });
  house(scene, 8, 23, 8, 7, 4, { roof: 0x4a4a4a, chimney: true, wall: 0xc8b8a8 });
  house(scene, -28, 26, 8, 8, 4);
  house(scene, 36, -12, 6, 6, 3.6, { wall: 0xd8c0a8 });
  house(scene, -12, -42, 7, 6, 3.6);

  const sy = ground(-18, -1);
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 6), M.logs()), -18.4, sy + 1.5, 1);
  addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 1.4), M.planks(0xd8b890)), -18.4, sy + 2.6, 1.6);
  // forge
  const fy = ground(14, 20);
  addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2), M.stone()), 14, fy + 0.6, 20); addBox(14, 20, 1.1, 1.1);
  const coal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), mat(0xff5a1a, { basic: true })); coal.position.set(14, fy + 1.25, 20); scene.add(coal); G.flames.push(coal);
  const fl = new THREE.PointLight(0xff6a2a, 25, 16, 2); fl.position.set(14, fy + 2.5, 20); scene.add(fl); G.lights.push({ l: fl, base: 25 });
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.7, 8), M.logs()), 11, fy + 0.35, 18);
  addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.45), M.iron(0x3a3a3a)), 11, fy + 0.85, 18); addCircle(11, 18, 0.5);
  // market stall
  const my = ground(-16, 16);
  addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1.2), M.planks(0xd8c0a0)), -16, my + 0.5, 16); addBox(-16, 16, 2.1, 0.7);
  for (const sx of [-1.9, 1.9]) for (const sz of [15.5, 18.5]) addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.8, 6), M.logs()), -16 + sx, my + 1.4, sz);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.6, 4, 4), M.cloth(0xb04030)); cloth.rotation.x = -Math.PI / 2 + 0.15; addMesh(scene, cloth, -16, my + 2.8, 17);
  for (let i = 0; i < 4; i++) addMesh(scene, new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat([0xc84a2a, 0x8ab84a, 0xe8c84a, 0x7a4ac8][i], { roughness: 0.5 })), -17.5 + i, my + 1.2, 16);
  for (const [x, z] of [[-19, 3], [-19.5, 4.5], [18, -2], [5, 18]]) { addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), M.planks(0xd8b890)), x, ground(x, z) + 0.45, z); addCircle(x, z, 0.6); }
  for (const [x, z] of [[-20, 1.5], [17, -3.5]]) { addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12), M.planks(0xc8a070)), x, ground(x, z) + 0.5, z); addCircle(x, z, 0.5); }
  // palisade
  const gapAngles = ROADS.map(r => Math.atan2(r[1][1], r[1][0]));
  const postGeo = new THREE.CylinderGeometry(0.3, 0.36, 4.2, 7); postGeo.translate(0, 1.6, 0);
  const tipGeo = new THREE.ConeGeometry(0.31, 0.8, 7); tipGeo.translate(0, 4.1, 0);
  const wallGeo = mergeGeometries([postGeo, tipGeo]);
  const R = 47, count = Math.floor(2 * Math.PI * R / 0.68);
  const posts = new THREE.InstancedMesh(wallGeo, triMat('bark', 0xd0c0b0, { scale: 0.7 }), count); posts.castShadow = true; posts.receiveShadow = true;
  const Mx = new THREE.Matrix4(); let n = 0;
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2;
    let gate = false;
    for (const ga of gapAngles) { let d = Math.abs(a - ga); d = Math.min(d, Math.PI * 2 - d); if (d < 0.11) gate = true; }
    if (gate) continue;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    Mx.makeRotationY(i * 1.7).setPosition(x, ground(x, z) - 0.6 - (i % 3) * 0.15, z); posts.setMatrixAt(n++, Mx); addCircle(x, z, 0.4);
  }
  posts.count = n; scene.add(posts);
  for (const ga of gapAngles) for (const s of [-1, 1]) { const a = ga + s * 0.135; torch(scene, Math.cos(a) * (R - 1.2), Math.sin(a) * (R - 1.2), 3); }
}

function buildRedfang(scene) {
  const cx = 130, cz = 120;
  campfire(scene, cx, cz);
  for (const [x, z] of [[cx - 9, cz - 4], [cx + 8, cz - 6], [cx - 5, cz + 9], [cx + 9, cz + 9]]) {
    const y = ground(x, z);
    const t = new THREE.Mesh(new THREE.ConeGeometry(3, 3.4, 6, 1, true), M.cloth(0xa04a3a)); t.rotation.y = Math.PI / 6; addMesh(scene, t, x, y + 1.6, z);
    addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.8, 5), M.logs()), x, y + 1.9, z);
    addCircle(x, z, 2.2);
  }
  const by = ground(cx + 6, cz + 14);
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 6), M.logs()), cx + 6, by + 3, cz + 14);
  addMesh(scene, new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2, 2, 3), M.cloth(0xb02020)), cx + 6, by + 4.8, cz + 14.7).rotation.y = Math.PI / 2;
  const open = Math.atan2(40 - cz, 60 - cx);
  const stake = triMat('bark', 0xc8b8a8, { scale: 0.7 });
  for (let i = 0; i < 70; i++) {
    const a = i / 70 * Math.PI * 2; let d = Math.abs(a - (open + Math.PI * 2) % (Math.PI * 2)); d = Math.min(d, Math.PI * 2 - d);
    if (d < 0.22) continue;
    const r = 21, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.2, 3.2, 6), stake); s.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3); addMesh(scene, s, x, ground(x, z) + 1.2, z); addCircle(x, z, 0.5);
  }
  for (const [x, z] of [[cx - 2, cz + 13], [cx + 2, cz - 12], [cx - 13, cz + 3]]) { addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M.planks(0xc8a880)), x, ground(x, z) + 0.5, z); addCircle(x, z, 0.7); }
}

function buildBarrow(scene) {
  const cx = -150, cz = -120, y0 = ground(cx, cz);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), triMat('grass', 0xd8e0c8, { scale: 0.28 })); mound.scale.y = 0.6; addMesh(scene, mound, cx, y0 - 1, cz - 26);
  addCircle(cx, cz - 26, 13.5);
  addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 16), M.stone(0xd0ccc4)), cx, y0, cz - 8);
  for (const sx of [-1, 1]) { addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 1.4), M.stone(0xc8c4bc)), cx + sx * 3.5, y0 + 3.5, cz - 14); addCircle(cx + sx * 3.5, cz - 14, 1); }
  addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 1.6), M.stone(0xc0bcb4)), cx, y0 + 7.4, cz - 14);
  addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(5.6, 6, 0.4), mat(0x07070a)), cx, y0 + 3.0, cz - 14.6);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, r = 17, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const h = (i % 3 === 0) ? 2 : 5 + (i % 2) * 1.5;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, h, 8), M.rock(0xc8c8c0)); p.rotation.y = a; addMesh(scene, p, x, ground(x, z) + h / 2 - 0.3, z); addCircle(x, z, 0.9);
    if (i % 3 === 0) addMesh(scene, new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), M.rock()), x + 1.2, ground(x + 1.2, z) + 0.2, z + 0.6);
  }
  for (const sx of [-1, 1]) {
    addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 3), M.stone(0xd8d4cc)), cx + sx * 5, y0 + 0.8, cz - 6);
    addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 3.2), M.stone(0xc0bcb4)), cx + sx * 5, y0 + 1.4, cz - 6);
    addBox(cx + sx * 5, cz - 6, 0.8, 1.6);
  }
  for (const sx of [-1, 1]) {
    const x = cx + sx * 6, z = cz - 12;
    addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.4, 8), M.iron(0x3a3a3a)), x, y0 + 1.0, z);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), mat(0x55aaff, { basic: true })); f.position.set(x, y0 + 2.1, z); scene.add(f); G.flames.push(f);
  }
  const L = new THREE.PointLight(0x5599ff, 40, 32, 2); L.position.set(cx, y0 + 4, cz - 8); scene.add(L); G.lights.push({ l: L, base: 40 });
}

function buildShrine(scene) {
  const cx = -60, cz = -195, y0 = ground(cx, cz);
  const glow = [];
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 1.15 + i * 0.18, r = 7, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5 - Math.abs(i - 2) * 0.7, 0.8), M.rock(0xb8b8b4)); slab.rotation.y = -a - Math.PI / 2; addMesh(scene, slab, x, y0 + 2.2, z); addCircle(x, z, 1.4);
    for (let k = 0; k < 3; k++) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(1.6 - k * 0.3, 0.1, 0.05), mat(0x6ad8ff, { basic: true })); rune.rotation.y = -a - Math.PI / 2;
      rune.position.set(x - Math.cos(a) * 0.43, y0 + 1.6 + k * 0.7, z - Math.sin(a) * 0.43); scene.add(rune); glow.push(rune);
    }
  }
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9, 0.4, 24), M.stone(0xc8c4bc)), cx, y0 - 0.05, cz);
  const wallPos = new THREE.Vector3(cx + Math.cos(Math.PI * 1.51) * 5.5, y0, cz + Math.sin(Math.PI * 1.51) * 5.5);
  G.interactables.push({ kind: 'wordwall', pos: wallPos, glow });
  const L = new THREE.PointLight(0x66ccff, 20, 18, 2); L.position.set(wallPos.x, y0 + 3, wallPos.z); scene.add(L); G.lights.push({ l: L, base: 20 });
  campfire(scene, cx + 4, cz + 3, 0x66ccff, false);
}

function buildSummit(scene) {
  const cx = 170, cz = -170, y0 = ground(cx, cz);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = 22, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 1.0), M.rock(0xc8c8c4)); st.rotation.y = a; st.rotation.z = (i % 2 - 0.5) * 0.12; addMesh(scene, st, x, ground(x, z) + 2.5, z); addCircle(x, z, 1);
  }
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), M.bone()); skull.scale.set(1, 0.75, 1.4); addMesh(scene, skull, cx - 8, y0 + 0.9, cz + 6);
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.14, 6, 12, Math.PI * 0.6), M.bone()); rib.rotation.set(0, Math.PI / 2, sx > 0 ? 0.3 : Math.PI - 0.3);
    addMesh(scene, rib, cx - 8, y0 + 0.2, cz + 9 + i * 1.3);
  }
  for (let i = 0; i < 6; i++) addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.25 - i * 0.03, 0.28 - i * 0.03, 1.2, 6), M.bone()), cx - 8, y0 + 0.3, cz + 15.5 + i * 1.1).rotation.x = Math.PI / 2;
}

function buildStones(scene) {
  const cx = 70, cz = -55;
  let i = 0;
  for (const id in STONES) {
    const a = i / 3 * Math.PI * 2 + 0.4, x = cx + Math.cos(a) * 6, z = cz + Math.sin(a) * 6, y = ground(x, z);
    const geo = new THREE.CylinderGeometry(0.7, 1.3, 6, 7, 4); jitter(geo, 0.12, i * 5);
    addMesh(scene, new THREE.Mesh(geo, M.rock(0xc0c0b8)), x, y + 2.8, z);
    const sig = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), mat(STONES[id].color, { basic: true }));
    sig.position.set(x, y + 3.4, z); scene.add(sig);
    addCircle(x, z, 1.3);
    G.interactables.push({ kind: 'stone', id, pos: new THREE.Vector3(x, y, z), sig });
    i++;
  }
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, 0.3, 24), M.stone(0xc0bcb4)), cx, ground(cx, cz) - 0.05, cz);
}

function buildTower(scene) {
  const cx = -40, cz = 150, y0 = ground(cx, cz);
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 13, 16), M.stone(0xd8d4cc)), cx, y0 + 6, cz - 6);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), M.stone()); c.rotation.y = -a; addMesh(scene, c, cx + Math.cos(a) * 3, y0 + 13, cz - 6 + Math.sin(a) * 3); }
  addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.3), M.planks(0x9a7a64)), cx, y0 + 1.3, cz - 2.55);
  addCircle(cx, cz - 6, 3.6);
  for (const [x, z, w] of [[cx - 7, cz + 2, 5], [cx + 7, cz - 1, 4]]) { addMesh(scene, new THREE.Mesh(new THREE.BoxGeometry(w, 2, 1), M.stone(0xc8c4bc)), x, ground(x, z) + 0.8, z); addBox(x, z, w / 2, 0.5); }
  campfire(scene, cx - 2, cz + 5, 0xff7a2a, false);
}

function buildCabin(scene) {
  house(scene, 200, 34, 7, 6, 3.6, { roof: 0x3a4a2a, chimney: true });
  const y = ground(206, 42);
  for (const sx of [-1, 1]) addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2, 6), M.logs()), 206 + sx, y + 1, 42);
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), M.logs()), 206, y + 1.9, 42).rotation.z = Math.PI / 2;
  addMesh(scene, new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), uvMat('fur', 0xb09878, { side: THREE.DoubleSide })), 206, y + 1.3, 42);
  addMesh(scene, new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 10), M.logs()), 197, y + 0.3, 41);
}

// ------------------------------------------------------------------ chests & herbs
function dryLand(x, z) {
  for (let i = 0; i < 80 && ground(x, z) < 0.8; i++) {
    let bx = 0, bz = 0, bh = -1e9;
    for (let a = 0; a < 8; a++) { const nx = x + Math.cos(a * Math.PI / 4) * 2, nz = z + Math.sin(a * Math.PI / 4) * 2, h = ground(nx, nz); if (h > bh) { bh = h; bx = nx; bz = nz; } }
    x = bx; z = bz;
  }
  return [x, z];
}

function buildPickups(scene) {
  for (const c of CHESTS) [c.x, c.z] = dryLand(c.x, c.z);
  for (const h of HERBS) [h[0], h[1]] = dryLand(h[0], h[1]);
  for (const c of CHESTS) {
    const { g, lid } = chestMesh(scene, c.x, c.z, Math.random() * 6);
    G.interactables.push({ kind: 'chest', id: c.id, data: c, pos: new THREE.Vector3(c.x, ground(c.x, c.z), c.z), lid, g });
  }
  const petal = mat(0xb8ecff, { emissive: 0x3aa8e8, ei: 0.9, roughness: 0.4 }), stemM = mat(0x3a6a3a);
  HERBS.forEach(([x, z], i) => {
    const g = new THREE.Group(), y = ground(x, z);
    for (let k = 0; k < 4; k++) {
      const ox = Math.cos(k * 1.7) * 0.15, oz = Math.sin(k * 1.7) * 0.15;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.5, 4), stemM); stem.position.set(ox, 0.25, oz); g.add(stem);
      for (let pI = 0; pI < 5; pI++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), petal); p.scale.set(1, 0.3, 0.5);
        p.position.set(ox + Math.cos(pI * 1.256) * 0.06, 0.52, oz + Math.sin(pI * 1.256) * 0.06); p.rotation.y = -pI * 1.256; g.add(p);
      }
    }
    g.position.set(x, y, z); scene.add(g);
    G.interactables.push({ kind: 'herb', id: 'h' + i, pos: new THREE.Vector3(x, y, z), g });
  });
}

// ------------------------------------------------------------------ sky / lighting
let hemi, sun, stars, sky, envSky, envScene, pmrem, envRT, clouds, lastEnvAngle = 99;
const tmpC = new THREE.Color(), fogDay = new THREE.Color(0xa9c4dc), fogDusk = new THREE.Color(0xd8a888), fogNight = new THREE.Color(0x1a2438);
const sunDir = new THREE.Vector3();

// Gradient sky with sun glow; also rendered into a PMREM environment map for lighting/reflections.
function makeSky(radius) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(0, 1, 0) }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, glow: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 sunDir, zenith, horizon, ground, sunCol; uniform float glow; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(horizon, zenith, pow(smoothstep(0.0, 0.65, h), 0.7));
        c = mix(c, ground, smoothstep(0.0, -0.25, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.6) * glow;
        c += sunCol * smoothstep(0.9993, 0.9997, s) * 6.0 * glow;     // sun disc
        c += horizon * 0.25 * pow(1.0 - abs(h), 8.0);                   // horizon haze
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), m); mesh.frustumCulled = false;
  return mesh;
}
const SKY = { zDay: new THREE.Color(0x2f6fc4), hDay: new THREE.Color(0xb4d0ea), zDusk: new THREE.Color(0x3a4a8a), hDusk: new THREE.Color(0xf09060),
  zNight: new THREE.Color(0x0a1530), hNight: new THREE.Color(0x22324f), gDay: new THREE.Color(0x5a6a72), gNight: new THREE.Color(0x05080e) };
function paintSky(m, sunDir, day, dusk, moon) {
  const u = m.material.uniforms;
  u.sunDir.value.copy(sunDir);
  u.zenith.value.copy(SKY.zNight).lerp(SKY.zDay, day).lerp(SKY.zDusk, dusk * 0.5);
  u.horizon.value.copy(SKY.hNight).lerp(SKY.hDay, day).lerp(SKY.hDusk, dusk * 0.75);
  u.ground.value.copy(SKY.gNight).lerp(SKY.gDay, day);
  u.sunCol.value.set(moon ? 0x9ab0e0 : dusk > 0.3 ? 0xffa060 : 0xfff2d0);
  u.glow.value = moon ? 0.25 : 1;
}

function buildSky(scene) {
  hemi = new THREE.HemisphereLight(0xcfe0ff, 0x4a5a3a, 0.5); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff1d8, 3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target);
  scene.fog = new THREE.FogExp2(0xb6cde0, 0.0024);

  sky = makeSky(420); scene.add(sky);
  envScene = new THREE.Scene(); envSky = makeSky(100); envScene.add(envSky);
  pmrem = new THREE.PMREMGenerator(G.renderer);

  const sp = new Float32Array(2000 * 3); const R = rng(99);
  for (let i = 0; i < 2000; i++) {
    const u = R() * 2 - 1, th = R() * 6.28, r = Math.sqrt(1 - u * u);
    sp[i * 3] = r * Math.cos(th) * 380; sp[i * 3 + 1] = Math.abs(u) * 380; sp[i * 3 + 2] = r * Math.sin(th) * 380;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);

  const cgeo = new THREE.PlaneGeometry(1000, 1000); cgeo.rotateX(-Math.PI / 2);
  clouds = new THREE.Mesh(cgeo, new THREE.ShaderMaterial({
    uniforms: { map: { value: cloudTexture() }, off: { value: new THREE.Vector2() }, col: { value: new THREE.Color(1, 1, 1) }, shade: { value: new THREE.Color(0.7, 0.72, 0.78) }, camPos: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D map; uniform vec2 off; uniform vec3 col, shade, camPos; varying vec3 vW;
      void main(){ vec2 p = vW.xz * 0.0011 + off; float a = texture2D(map, p).a; float b = texture2D(map, p * 2.7 + off * 0.6).a;
        float d = a * 0.7 + b * 0.3; float dist = length(vW.xz - camPos.xz);
        float alpha = d * (1.0 - smoothstep(200.0, 470.0, dist));
        gl_FragColor = vec4(mix(shade, col, smoothstep(0.2, 0.9, b)), alpha * 0.9); }`,
    transparent: true, depthWrite: false, fog: false,
  }));
  clouds.renderOrder = -1; clouds.frustumCulled = false;
  scene.add(clouds);
}

export function daylight() { const a = (G.time - 6) / 12 * Math.PI; return clamp(Math.sin(a) * 1.6 + 0.15, 0, 1); }

export function updateWorld(dt, ppos) {
  const a = (G.time - 6) / 12 * Math.PI, day = daylight();
  const dusk = clamp(1 - Math.abs(Math.sin(a)) * 3, 0, 1);
  const elev = Math.sin(a);
  // sun direction (sky shader + light)
  sunDir.set(Math.cos(a) * 0.9, elev * 0.62, 0.55).normalize();   // a northern sun: never directly overhead, so faces and walls catch light
  const moon = elev < -0.05;
  const skyDir = moon ? new THREE.Vector3(-sunDir.x, -sunDir.y, sunDir.z) : sunDir;
  paintSky(sky, skyDir, day, dusk, moon);
  sky.position.copy(G.camera.position);
  // environment lighting from the sky, refreshed as the sun moves
  if (Math.abs(a - lastEnvAngle) > 0.025) {
    lastEnvAngle = a;
    paintSky(envSky, skyDir, day, dusk, moon);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0, 0.1, 1000);
    G.scene.environment = envRT.texture;
  }
  G.scene.environmentIntensity = 0.6 + day * 0.4;
  tmpC.copy(fogNight).lerp(fogDay, day).lerp(fogDusk, dusk * 0.6);
  G.scene.fog.color.copy(tmpC);
  G.scene.fog.density = 0.0021 + (1 - day) * 0.0018;
  const isDay = elev > -0.05;
  const lightDir = isDay ? sunDir : new THREE.Vector3(-sunDir.x, -sunDir.y, sunDir.z);
  const el = Math.max(lightDir.y, 0.22);
  sun.position.set(ppos.x + lightDir.x * 140, ppos.y + el * 160, ppos.z + lightDir.z * 140);
  sun.target.position.copy(ppos);
  sun.intensity = isDay ? 0.4 + day * 2.8 : 1.0;
  sun.color.set(isDay ? (dusk > 0.3 ? 0xffb07a : 0xfff1d8) : 0x8aa6ff);
  hemi.intensity = 0.35 + day * 0.45;
  hemi.color.set(day > 0.3 ? 0xcfe0ff : 0x5a6a9a);
  stars.material.opacity = clamp(1 - day * 2.5, 0, 1);
  stars.position.copy(ppos);
  // clouds
  const t = performance.now() * 0.001;
  const cu = clouds.material.uniforms;
  clouds.position.set(G.camera.position.x, 150, G.camera.position.z);
  cu.off.value.set(t * 0.0025, t * 0.001); cu.camPos.value.copy(G.camera.position);
  cu.col.value.setRGB(1, 1, 1).lerp(new THREE.Color(1, 0.75, 0.6), dusk * 0.7).multiplyScalar(0.15 + day * 0.85);
  cu.shade.value.setRGB(0.62, 0.66, 0.74).multiplyScalar(0.12 + day * 0.85);
  // water + grass
  if (waterMat) { waterMat.normalMap.offset.set(t * 0.008, t * 0.005); }
  grassUniforms.gTime.value = t;
  if (grass && Math.hypot(ppos.x - grassCenter.x, ppos.z - grassCenter.y) > 6) { grassCenter.set(ppos.x, ppos.z); placeGrass(ppos.x, ppos.z); }
  for (const f of G.flames) { f.scale.y = 0.85 + Math.sin(t * 13 + f.position.x) * 0.15; }
  for (const L of G.lights) L.l.intensity = L.base * (0.85 + Math.sin(t * 9 + L.l.position.x) * 0.1 + Math.random() * 0.08) * (0.6 + (1 - day) * 0.6);
}

// ------------------------------------------------------------------ public build
export function buildWorld(scene) {
  G.flames = [];
  buildTerrain(scene);
  buildSky(scene);
  buildGrass(scene);
  buildAshvale(scene);
  buildRedfang(scene);
  buildBarrow(scene);
  buildShrine(scene);
  buildSummit(scene);
  buildStones(scene);
  buildTower(scene);
  buildCabin(scene);
  buildPickups(scene);
  scatterVegetation(scene);
}

// Pre-rendered top-down parchment-style map (used by the map screen).
export function renderMapImage(size = 600) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(size, size);
  const cols = [[96, 120, 60], [120, 96, 66], [128, 124, 116], [196, 180, 136], [236, 240, 244]];
  const w = [0, 0, 0, 0, 0];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = -HALF + (px + 0.5) / size * HALF * 2, z = -HALF + (py + 0.5) / size * HALF * 2;
    const h = ground(x, z);
    const ny = 1 / Math.sqrt(1 + ((ground(x + 1, z) - ground(x - 1, z)) / 2) ** 2 + ((ground(x, z + 1) - ground(x, z - 1)) / 2) ** 2);
    let r, g, b;
    if (h < WATER) { const d = clamp(-h / 10, 0, 1); r = 46 - d * 20; g = 92 - d * 34; b = 118 - d * 36; }
    else {
      surfaceWeights(x, z, h, ny, w); r = g = b = 0;
      for (let i = 0; i < 5; i++) { r += cols[i][0] * w[i]; g += cols[i][1] * w[i]; b += cols[i][2] * w[i]; }
      const forest = fbm(x * 0.012 + 3, z * 0.012 + 7, 3) > 0.5 && h > 0.8 && h < 60 ? 0.78 : 1;
      r *= forest; g *= forest; b *= forest;
    }
    const shade = clamp(0.8 + (ground(x - 1, z - 1) - h) * -0.3, 0.55, 1.2);
    const k = (py * size + px) * 4;
    img.data[k] = r * shade; img.data[k + 1] = g * shade; img.data[k + 2] = b * shade; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
