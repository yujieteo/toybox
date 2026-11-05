import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { modelBounds } from '../core/geom.ts';
import { must, view } from './helpers.ts';

type Triple = [number, number, number];
interface Part { prim: string; color: string; pos: Triple; size: Triple; rot: Triple }
interface Group { tris: number; color: string }
interface Model { id: string; name: string; kind: string; license: string; size: Triple; parts: Part[]; mesh?: string; source: string; groups: Group[] }
interface CatalogueFile { models: Model[] }

const cat = view<CatalogueFile>(JSON.parse(readFileSync(new URL('../assets/catalogue.json', import.meta.url), 'utf8')));
const kit = cat.models.filter((m: Model) => !m.mesh), imported = cat.models.filter((m: Model) => m.mesh);
const KINDS = ['vehicle', 'building', 'furniture', 'structure', 'prop', 'sign', 'road', 'nature'];
const REQUIRED = ['car-sedan', 'car-taxi', 'car-police', 'ambulance-scdf', 'bus-public', 'bus-private', 'lorry', 'motorbike', 'shophouse-2', 'shophouse-3',
  'hdb-slab', 'bus-stop', 'kerb', 'road-straight', 'road-junction', 'road-zebra', 'lamp-post', 'traffic-light', 'bin', 'barrier', 'cone', 'tree', 'bench', 'sign',
  'wall-3', 'wall-5', 'wall-door-3', 'door', 'window', 'floor-tile', 'ceiling-tile', 'stairs-14', 'escalator', 'lift-door', 'reception-desk', 'table', 'chair',
  'banquet-table-8', 'stage', 'sofa', 'plant', 'notice-board', 'turnstile',
  'mrt-train-car', 'mrt-train-door-leaf', 'psd-bay', 'psd-leaf', 'platform-edge-strip', 'fare-gate', 'station-wall', 'mrt-track', 'psd-panel'];

// One number of a vector.
function at3(v: readonly number[], i: number): number { return must(v[i], `component ${i}`); }

function tests1(): void {
test('at least 45 models, unique ids, required ids present', () => {
  assert.ok(cat.models.length >= 45);
  const ids = cat.models.map((m: Model) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of REQUIRED) assert.ok(ids.includes(id), `missing ${id}`);
  assert.ok(ids.some((i: string) => i.startsWith('shopfront')));
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
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(at3(b.size, i) - at3(m.size, i)) < 0.01, `${m.id} size[${i}] ${b.size[i]} vs ${m.size[i]}`);
    assert.ok(Math.abs(at3(b.min, 1)) < 0.01, `${m.id} bottom`);
    assert.ok(Math.abs(at3(b.min, 0) + at3(b.max, 0)) < 0.01 && Math.abs(at3(b.min, 2) + at3(b.max, 2)) < 0.01, `${m.id} centred`);
  }
});
}
tests1();

function tests2(): void {
test('real sizes are plausible', () => {
  const find = (id: string): Model => must(cat.models.find((m: Model) => m.id === id), id);
  const get = (id: string): Triple => find(id).size;
  assert.ok(get('bus-public')[2] >= 10 && get('bus-public')[2] <= 13);
  assert.ok(get('car-sedan')[2] >= 4 && get('car-sedan')[2] <= 5);
  assert.ok(get('stairs-14')[1] > 2.2 && get('stairs-14')[1] < 2.6);
  assert.equal(get('wall-3')[0], 3); assert.equal(get('wall-5')[0], 5);
  assert.ok(get('stairs-14').length === 3);
  // MRT station kit: a full train car, a full-height screen door bay and a fare gate pedestal
  const train = get('mrt-train-car');
  assert.ok(train[2] >= 18 && train[2] <= 26, `train length ${train[2]}`);
  assert.ok(train[0] >= 2.8 && train[0] <= 3.4, `train width ${train[0]}`);
  assert.ok(train[1] >= 2.8 && train[1] <= 3.6, `train height ${train[1]}`);
  const bay = get('psd-bay'); assert.ok(bay[1] >= 2.6 && bay[1] <= 3.4, `screen door height ${bay[1]}`); assert.ok(bay[0] >= 2.2 && bay[0] <= 3.0);
  assert.ok(get('psd-leaf')[1] >= 1.9 && get('psd-leaf')[1] <= 2.5);
  assert.ok(get('psd-panel')[0] >= 3.5 && get('psd-panel')[0] <= 5 && get('psd-panel')[1] >= 2.6 && get('psd-panel')[1] <= 3.4);
  assert.ok(get('mrt-train-door-leaf')[1] >= 1.8 && get('mrt-train-door-leaf')[1] <= 2.2);
  const edge = get('platform-edge-strip'); assert.equal(edge[0], 4); assert.ok(edge[1] <= 0.12, `edge strip height ${edge[1]}`); assert.ok(edge[2] >= 0.7 && edge[2] <= 1.2, `edge strip depth ${edge[2]}`);
  const gate = get('fare-gate'); assert.ok(gate[1] >= 1.0 && gate[1] <= 1.4); assert.ok(gate[2] >= 1.2 && gate[2] <= 2.0);
  assert.ok(get('station-wall')[0] >= 4 && get('station-wall')[1] >= 3.5 && get('station-wall')[1] <= 5);
  const track = find('mrt-track'); assert.equal(track.kind, 'road'); assert.equal(track.size[0], 24); assert.ok(track.size[1] <= 0.15 && track.size[2] >= 3 && track.size[2] <= 5);
});
}
tests2();

// The rows of the table in assets/ATTRIBUTION.md, as objects keyed by the header cells.
function attribution(): Record<string, string | undefined>[] {
  const rows = readFileSync(new URL('../assets/ATTRIBUTION.md', import.meta.url), 'utf8').split('\n')
    .filter((l: string) => l.startsWith('|')).map((l: string) => l.slice(1, -1).split('|').map((c: string) => c.trim()));
  const [head = [], , ...body] = rows;
  return body.map((r: string[]) => Object.fromEntries(head.map((h: string, i: number) => [h, r[i]])));
}

// Reads a mesh file (format in tools/assets/import.ts): the vertex count of each group and the bounds.
function readMesh(file: URL): { counts: number[]; min: Triple; max: Triple } {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'TBM1', String(file));
  const g = b.readUInt32LE(4), s = b.readFloatLE(8), counts = [...Array(g)].map((_: unknown, i: number) => b.readUInt32LE(12 + 4 * i));
  const n = counts.reduce((t, c) => t + c, 0), base = 12 + 4 * g;
  assert.equal(b.length, base + n * 12, `${file} length`);
  const min: Triple = [Infinity, Infinity, Infinity], max: Triple = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < n; v++) for (const i of [0, 1, 2] as const) {
    const x = b.readInt16LE(base + v * 12 + i * 2) * s;
    min[i] = Math.min(min[i], x); max[i] = Math.max(max[i], x);
  }
  return { counts, min, max };
}

function tests3(): void {
test('imported models are CC0 with a source, a mesh file and an attribution entry', () => {
  assert.ok(imported.some((m: Model) => m.source.startsWith('https://kenney.nl/')), 'a Kenney model');
  assert.ok(imported.some((m: Model) => m.source.startsWith('https://polyhaven.com/')), 'a Poly Haven model');
  const credits = attribution();
  for (const m of imported) {
    assert.equal(m.license, 'CC0', m.id);
    assert.ok(/^https:\/\//.test(m.source), `${m.id} source`);
    assert.ok(KINDS.includes(m.kind), m.id);
    const file = new URL(`../assets/${m.mesh}`, import.meta.url);
    assert.ok(existsSync(file), `${m.id} mesh file`);
    const { counts, min, max } = readMesh(file);
    for (const i of [0, 1, 2] as const) assert.ok(Math.abs(max[i] - min[i] - m.size[i]) < 0.01, `${m.id} size[${i}]`);
    assert.ok(Math.abs(min[1]) < 0.01 && Math.abs(min[0] + max[0]) < 0.01 && Math.abs(min[2] + max[2]) < 0.01, `${m.id} centred on the ground`);
    assert.equal(counts.length, m.groups.length, `${m.id} groups`);
    for (const [i, n] of counts.entries()) {
      assert.ok(n > 0 && n % 3 === 0, `${m.id} group ${i} has whole triangles`);
      const group = must(m.groups[i], `${m.id} group ${i}`);
      assert.equal(n / 3, group.tris, `${m.id} group ${i} count`);
      assert.ok(/^#[0-9a-f]{6}$/i.test(group.color), `${m.id} colour`);
    }
    const row = must(credits.find((r) => r.id === m.id), `${m.id} in ATTRIBUTION.md`);
    assert.equal(row['source page']?.replace(/^<|>$/g, ''), m.source);
    assert.equal(row.licence, 'CC0 1.0');
    assert.ok(row.author && row.checked, m.id);
  }
});
}
tests3();
