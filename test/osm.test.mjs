import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchBuildings, parseOverpass, toMapBlock, writeOdbl, tileXY, tileUrl, project, buildingHeight, OVERPASS_URL } from '../core/osm.mjs';
import { validate, newScene } from '../core/scene.mjs';

const sample = JSON.parse(readFileSync(new URL('./fixtures/overpass-sample.json', import.meta.url), 'utf8'));
const origin = { lat: 1.3068, lon: 103.8512 };

test('projection: x east, z south, in metres', () => {
  const [x, z] = project(1.3068 + 0.001, 103.8512 + 0.001, origin);
  assert.ok(Math.abs(x - 111.2) < 1 && Math.abs(z + 111.2) < 1, `${x} ${z}`);
});

test('height rules', () => {
  assert.equal(buildingHeight({ height: '12 m' }).height, 12);
  assert.equal(buildingHeight({ 'building:levels': '3' }).height, 9.6);
  assert.equal(buildingHeight({ height: '10', 'building:levels': '3' }).height, 10);
  assert.equal(buildingHeight({}).height, 9);
});

test('parse recorded sample and build the map block', () => {
  const b = parseOverpass(sample, origin);
  assert.equal(b.length, 3, 'roads are skipped');
  assert.equal(b[0].id, 'w1001'); assert.equal(b[0].height, 12); assert.equal(b[0].poly.length, 4, 'closing vertex dropped');
  assert.equal(b[1].height, 9.6); assert.equal(b[1].levels, 3);
  assert.equal(b[2].height, 9);
  const blk = toMapBlock(b, origin);
  assert.equal(blk.attribution, '© OpenStreetMap contributors');
  assert.ok(blk.buildings.every((x) => !x.ll && x.poly.every((p) => p.length === 2)));
  const s = newScene({}); s.map = { origin, osm: blk }; assert.deepEqual(validate(s), []);
});

test('fetchBuildings sends the Overpass query', async () => {
  let seen;
  const fake = async (url, init) => { seen = { url, body: decodeURIComponent(init.body) }; return { ok: true, json: async () => sample }; };
  const b = await fetchBuildings({ lat: 1.3068, lon: 103.8512, radius: 100, fetchImpl: fake });
  assert.equal(seen.url, OVERPASS_URL);
  assert.match(seen.body, /way\["building"\]\(around:100,1\.3068,103\.8512\);out geom;/);
  assert.equal(b.length, 3);
});

test('writeOdbl keeps the licence and the credit with the data', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'tbosm-')), 'osm.json');
  const f = writeOdbl(p, parseOverpass(sample, origin), origin);
  const back = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(back.header.license, 'ODbL 1.0'); assert.equal(back.header.credit, '© OpenStreetMap contributors');
  assert.equal(back.osm.buildings.length, 3); assert.equal(f.header.license, 'ODbL 1.0');
});

test('OneMap tile addresses', () => {
  const t = tileXY(1.3068, 103.8512, 18);
  assert.ok(t.x > 200000 && t.x < 270000 && t.y > 100000 && t.y < 140000);
  assert.deepEqual(tileXY(0, 0, 1), { x: 1, y: 1 });
  assert.deepEqual(tileXY(85, -180, 2), { x: 0, y: 0 });
  assert.equal(tileUrl(1.3068, 103.8512, 18), `https://www.onemap.gov.sg/maps/tiles/Default/18/${t.x}/${t.y}.png`);
});

test('live Overpass call (skipped when the network fails)', async (tc) => {
  let b;
  try { b = await fetchBuildings({ lat: 1.3068, lon: 103.8512, radius: 80, fetchImpl: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(8000) }) }); } catch { return tc.skip('network unavailable'); }
  assert.ok(Array.isArray(b));
});

test('recorded real Overpass answer (OpenStreetMap data, ODbL 1.0)', () => {
  const rec = JSON.parse(readFileSync(new URL('./fixtures/overpass-recorded.json', import.meta.url), 'utf8'));
  const b = parseOverpass(rec, origin);
  assert.ok(b.length > 3);
  for (const x of b) { assert.ok(x.height > 0); assert.ok(x.poly.length >= 3); assert.ok(x.poly.every(([px, pz]) => Math.hypot(px, pz) < 300)); }
  const s = newScene({}); s.map = { origin, osm: toMapBlock(b, origin) }; assert.deepEqual(validate(s), []);
});
