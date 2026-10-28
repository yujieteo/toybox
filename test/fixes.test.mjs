import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { commands as C } from '../core/commands.mjs';
import { newScene, valueAt, trackOf, srt as coreSrt } from '../core/scene.mjs';
import { srt as webSrt } from '../web/export.js';

const must = (r) => { assert.ok(r.ok, JSON.stringify(r)); return r.result; };
const overpass = JSON.parse(readFileSync(new URL('../evals/fixtures/race-course-road-osm.json', import.meta.url), 'utf8'));
const BBOX = [1.3077, 103.8501, 1.3101, 103.8524];

test('set_pose without t sets the pose at time 0 when a later pose key exists', () => {
  const s = newScene({});
  must(C.place(s, { model: 'person', at: [0, 0], id: 'p', estimated: true }));
  must(C.set_pose(s, { id: 'p', t: 5, pose: 'sit' }));
  must(C.set_pose(s, { id: 'p', pose: 'wave' }));
  const keys = trackOf(s, 'p', 'pose').keys;
  assert.equal(valueAt(keys, 0), 'wave'); assert.equal(valueAt(keys, 2), 'wave'); assert.equal(valueAt(keys, 6), 'sit');
});

test('import_osm stores real footprints, turns them, and writes the ODbL data file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tbimp-'));
  const s = newScene({});
  must(C.set_backdrop(s, { ground: 'street', origin: { lat: 1.30888, lon: 103.85116 }, estimated: true, source: 'estimated' }));
  const r = must(C.import_osm(s, { bbox: BBOX, bearing: 35 }, { overpass, odblPath: join(dir, 'x.osm.json') }));
  assert.ok(r.buildings > 50);
  assert.equal(s.map.osm.attribution, '© OpenStreetMap contributors');
  assert.equal(s.map.osm.dataFile, 'x.osm.json'); assert.equal(s.map.bearing, 35);
  const file = JSON.parse(readFileSync(join(dir, 'x.osm.json'), 'utf8'));
  assert.equal(file.header.license, 'ODbL 1.0'); assert.equal(file.bearing, 35);
  assert.equal(file.osm.buildings.length, s.map.osm.buildings.length);
  // Race Course Road runs along z after the turn: no footprint covers its centre line.
  const inside = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  for (let z = -80; z <= 80; z += 4) assert.ok(!s.map.osm.buildings.some((b) => inside(b.poly, 0, z)), `footprint on the road at z=${z}`);
  const bad = C.set_backdrop(s, { ground: 'map' });
  assert.equal(bad.ok, false); assert.equal(bad.errors[0].path, 'map.bearing');
});

test('import_osm refuses a bad bbox and a missing Overpass answer', () => {
  const s = newScene({});
  assert.equal(C.import_osm(s, { bbox: [1.31, 103.85, 1.30, 103.86] }, { overpass }).errors[0].code, 'bad_args');
  assert.equal(C.import_osm(s, { bbox: BBOX }).errors[0].code, 'no_osm_data');
  must(C.import_osm(s, { bbox: BBOX }, { overpass }));
  assert.deepEqual(s.map.origin, { lat: 1.3089, lon: 103.85125 });
});

test('import_osm writes no data file when the scene change is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tbref-')), odblPath = join(dir, 'x.osm.json');
  const s = newScene({});
  must(C.set_backdrop(s, { ground: 'map', origin: { lat: 1.30888, lon: 103.85116 }, estimated: true, source: 'estimated' }));
  const r = C.import_osm(s, { bbox: BBOX, bearing: 35 }, { overpass, odblPath });
  assert.equal(r.ok, false); assert.equal(r.errors[0].path, 'map.bearing');
  assert.ok(!existsSync(odblPath)); assert.equal(s.map.osm, undefined);
});

test('export_scene writes the ODbL data file next to the exported scene', () => {
  const src = mkdtempSync(join(tmpdir(), 'tbsrc-')), out = mkdtempSync(join(tmpdir(), 'tbout-'));
  const s = newScene({});
  must(C.import_osm(s, { bbox: BBOX, bearing: 35 }, { overpass, odblPath: join(src, 'li.osm.json') }));
  const r = must(C.export_scene(s, { path: join(out, 'copy.toybox.json') }));
  assert.equal(r.odbl, join(out, 'li.osm.json'));
  assert.deepEqual(JSON.parse(readFileSync(r.odbl, 'utf8')), JSON.parse(readFileSync(join(src, 'li.osm.json'), 'utf8')));
});

test('export_scene keeps the MCP agent inside the scene folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tbexp-'));
  const s = newScene({});
  for (const path of ['../evil.toybox.json', '/tmp/evil.toybox.json', 'notes.txt']) assert.equal(C.export_scene(s, { path }, { exportDir: dir }).errors[0].code, 'bad_path', path);
  const r = must(C.export_scene(s, { path: 'copy.toybox.json' }, { exportDir: dir }));
  assert.equal(r.path, join(dir, 'copy.toybox.json')); assert.ok(existsSync(join(dir, 'copy.srt')));
});

test('the MP4 export .srt is in time order and the same as the core .srt', () => {
  const s = newScene({}); s.captions = [{ start: 5, end: 7, text: 'second' }, { start: 1, end: 3, text: 'first' }];
  assert.equal(webSrt(s), coreSrt(s));
  assert.match(webSrt(s), /^1\n00:00:01,000/);
});

test('daemon: static files stay in their folders, host is checked, stale scene writes are refused', async (tc) => {
  const dir = mkdtempSync(join(tmpdir(), 'tbsrv-')), scene = join(dir, 's.toybox.json');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [new URL('../app/serve.mjs', import.meta.url).pathname, '--scene', scene, '--port', String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  tc.after(() => child.kill());
  const token = await new Promise((ok, no) => {
    let out = ''; child.stdout.on('data', (d) => { out += d; const m = out.match(/token=(\w+)/); if (m) ok(m[1]); });
    child.on('exit', () => no(new Error('daemon stopped')));
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/viewer.html`)).status, 200);
  for (const p of ['/..%2Fapp%2Fserve.mjs', '/..%2Fout%2Fmcp.json', '/assets/..%2Fapp%2Fserve.mjs']) assert.equal((await fetch(base + p)).status, 403, p);
  const http = await import('node:http');
  const viaHost = await new Promise((ok) => http.get({ host: '127.0.0.1', port, path: '/viewer.html', headers: { host: 'evil.example' } }, (r) => { r.resume(); ok(r.statusCode); }));
  assert.equal(viaHost, 403);
  const body = readFileSync(scene, 'utf8');
  assert.equal((await fetch(`${base}/api/scene?token=${token}&v=1`, { method: 'POST', body })).status, 409);
  const v = statSync(scene).mtimeMs;
  const ok = await fetch(`${base}/api/scene?token=${token}&v=${v}`, { method: 'POST', body });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).v, statSync(scene).mtimeMs);
});
