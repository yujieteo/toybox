import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelBounds } from '../core/geom.mjs';

const cat = JSON.parse(readFileSync(new URL('../assets/catalogue.json', import.meta.url), 'utf8'));
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

test('every model has a kit licence, a valid kind and primitive parts', () => {
  for (const m of cat.models) {
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
  for (const m of cat.models) {
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
