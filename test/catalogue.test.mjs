import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { modelBounds } from '../core/geom.mjs';

const cat = JSON.parse(readFileSync(new URL('../assets/catalogue.json', import.meta.url), 'utf8'));
const kit = cat.models.filter((m) => !m.mesh), imported = cat.models.filter((m) => m.mesh);
const KINDS = ['vehicle', 'building', 'furniture', 'structure', 'prop', 'sign', 'road', 'nature'];
const REQUIRED = ['car-sedan', 'car-taxi', 'car-police', 'ambulance-scdf', 'bus-public', 'bus-private', 'lorry', 'motorbike', 'shophouse-2', 'shophouse-3',
  'hdb-slab', 'bus-stop', 'kerb', 'road-straight', 'road-junction', 'road-zebra', 'lamp-post', 'traffic-light', 'bin', 'barrier', 'cone', 'tree', 'bench', 'sign',
  'wall-3', 'wall-5', 'wall-door-3', 'door', 'window', 'floor-tile', 'ceiling-tile', 'stairs-14', 'escalator', 'lift-door', 'reception-desk', 'table', 'chair',
  'banquet-table-8', 'stage', 'sofa', 'plant', 'notice-board', 'turnstile'];

test('at least 45 models, unique ids, required ids present', () => {
  assert.ok(cat.models.length >= 45);
  const ids = cat.models.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of REQUIRED) assert.ok(ids.includes(id), `missing ${id}`);
  assert.ok(ids.some((i) => i.startsWith('shopfront')));
});

test('every kit model has a kit licence, a valid kind and primitive parts', () => {
  for (const m of kit) {
    assert.equal(m.license, 'CC0 (Toybox kit)', m.id);
    assert.ok(KINDS.includes(m.kind), m.id);
    assert.ok(m.parts.length > 0, m.id);
    for (const p of m.parts) {
      assert.ok(['box', 'cylinder', 'sphere', 'wedge'].includes(p.prim), m.id);
      assert.ok(/^#[0-9a-f]{6}$/i.test(p.color), `${m.id} colour`);
      assert.equal(p.pos.length, 3); assert.equal(p.size.length, 3); assert.equal(p.rot.length, 3);
    }
  }
});

test('parts bounding box matches size, centred on the footprint, sitting on the ground', () => {
  for (const m of kit) {
    const b = modelBounds(m.parts);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(b.size[i] - m.size[i]) < 0.01, `${m.id} size[${i}] ${b.size[i]} vs ${m.size[i]}`);
    assert.ok(Math.abs(b.min[1]) < 0.01, `${m.id} bottom`);
    assert.ok(Math.abs(b.min[0] + b.max[0]) < 0.01 && Math.abs(b.min[2] + b.max[2]) < 0.01, `${m.id} centred`);
  }
});

test('real sizes are plausible', () => {
  const get = (id) => cat.models.find((m) => m.id === id).size;
  assert.ok(get('bus-public')[2] >= 10 && get('bus-public')[2] <= 13);
  assert.ok(get('car-sedan')[2] >= 4 && get('car-sedan')[2] <= 5);
  assert.ok(get('stairs-14')[1] > 2.2 && get('stairs-14')[1] < 2.6);
  assert.equal(get('wall-3')[0], 3); assert.equal(get('wall-5')[0], 5);
  assert.ok(get('stairs-14').length === 3);
});

// The rows of the table in assets/ATTRIBUTION.md, as objects keyed by the header cells.
function attribution() {
  const rows = readFileSync(new URL('../assets/ATTRIBUTION.md', import.meta.url), 'utf8').split('\n')
    .filter((l) => l.startsWith('|')).map((l) => l.slice(1, -1).split('|').map((c) => c.trim()));
  const [head, , ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// Reads a mesh file (format in tools/assets/import.mjs): the vertex count of each group and the bounds.
function readMesh(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'TBM1', file);
  const g = b.readUInt32LE(4), s = b.readFloatLE(8), counts = [...Array(g)].map((_, i) => b.readUInt32LE(12 + 4 * i));
  const n = counts.reduce((t, c) => t + c, 0), base = 12 + 4 * g;
  assert.equal(b.length, base + n * 12, `${file} length`);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < n; v++) for (let i = 0; i < 3; i++) {
    const x = b.readInt16LE(base + v * 12 + i * 2) * s;
    min[i] = Math.min(min[i], x); max[i] = Math.max(max[i], x);
  }
  return { counts, min, max };
}

test('imported models are CC0 with a source, a mesh file and an attribution entry', () => {
  assert.ok(imported.some((m) => m.source.startsWith('https://kenney.nl/')), 'a Kenney model');
  assert.ok(imported.some((m) => m.source.startsWith('https://polyhaven.com/')), 'a Poly Haven model');
  const credits = attribution();
  for (const m of imported) {
    assert.equal(m.license, 'CC0', m.id);
    assert.ok(/^https:\/\//.test(m.source), `${m.id} source`);
    assert.ok(KINDS.includes(m.kind), m.id);
    const file = new URL(`../assets/${m.mesh}`, import.meta.url);
    assert.ok(existsSync(file), `${m.id} mesh file`);
    const { counts, min, max } = readMesh(file);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(max[i] - min[i] - m.size[i]) < 0.01, `${m.id} size[${i}]`);
    assert.ok(Math.abs(min[1]) < 0.01 && Math.abs(min[0] + max[0]) < 0.01 && Math.abs(min[2] + max[2]) < 0.01, `${m.id} centred on the ground`);
    assert.equal(counts.length, m.groups.length, `${m.id} groups`);
    for (const [i, n] of counts.entries()) {
      assert.ok(n > 0 && n % 3 === 0, `${m.id} group ${i} has whole triangles`);
      assert.equal(n / 3, m.groups[i].tris, `${m.id} group ${i} count`);
      assert.ok(/^#[0-9a-f]{6}$/i.test(m.groups[i].color), `${m.id} colour`);
    }
    const row = credits.find((r) => r.id === m.id);
    assert.ok(row, `${m.id} in ATTRIBUTION.md`);
    assert.equal(row['source page'], m.source);
    assert.equal(row.licence, 'CC0 1.0');
    assert.ok(row.author && row.checked, m.id);
  }
});
