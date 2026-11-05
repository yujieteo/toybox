import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { TestContext } from 'node:test';
import { commands as C } from '../core/commands.ts';
import { newScene, valueAt, trackOf, srt as coreSrt } from '../core/scene.ts';
import { srt as webSrt } from '../web/export.js';
import type { Vec2 } from '../web/types.ts';
import { must, okResult, firstError, isOk, view } from './helpers.ts';

interface Footprint { poly: Vec2[] }
interface OdblFile { header: { license: string }; bearing: number; osm: { buildings: unknown[] } }

// The result of a successful command, as the type T.
const done = <T = Record<string, never>>(r: unknown): T => okResult<T>(r);
const overpass = JSON.parse(readFileSync(new URL('../evals/fixtures/race-course-road-osm.json', import.meta.url), 'utf8'));
const BBOX = [1.3077, 103.8501, 1.3101, 103.8524];

function tests1(): void {
test('set_pose without t sets the pose at time 0 when a later pose key exists', () => {
  const s = newScene({});
  done(C.place(s, { model: 'person', at: [0, 0], id: 'p', estimated: true }));
  done(C.set_pose(s, { id: 'p', t: 5, pose: 'sit' }));
  done(C.set_pose(s, { id: 'p', pose: 'wave' }));
  const keys = must(trackOf(s, 'p', 'pose')).keys;
  assert.equal(valueAt(keys, 0), 'wave'); assert.equal(valueAt(keys, 2), 'wave'); assert.equal(valueAt(keys, 6), 'sit');
});

test('add_chapter without shot adds the chapter', () => {
  const s = newScene({});
  done(C.add_chapter(s, { start: 0, end: 5, title: 'Arrival', caption: 'A visitor arrives.', estimated: true }));
  assert.equal(s.chapters.length, 1); assert.equal(must(s.chapters[0]).shot, undefined);
  assert.equal(isOk(C.add_chapter(s, { start: 5, end: 9, title: 'Bad', caption: 'x', shot: 'nope' })), false);
});

test('import_osm stores real footprints, turns them, and writes the ODbL data file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tbimp-'));
  const s = newScene({});
  done(C.set_backdrop(s, { ground: 'street', origin: { lat: 1.30888, lon: 103.85116 }, estimated: true, source: 'estimated' }));
  const r = done<{ buildings: number }>(C.import_osm(s, { bbox: BBOX, bearing: 35 }, { overpass, odblPath: join(dir, 'x.osm.json') }));
  assert.ok(r.buildings > 50);
  const map = must(s.map), osm = must(map.osm);
  assert.equal(osm.attribution, '© OpenStreetMap contributors');
  assert.equal(osm.dataFile, 'x.osm.json'); assert.equal(map.bearing, 35);
  const file = view<OdblFile>(JSON.parse(readFileSync(join(dir, 'x.osm.json'), 'utf8')));
  assert.equal(file.header.license, 'ODbL 1.0'); assert.equal(file.bearing, 35);
  assert.equal(file.osm.buildings.length, osm.buildings.length);
  // Race Course Road runs along z after the turn: no footprint covers its centre line.
  const inside = (p: Vec2[], x: number, z: number): boolean => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = must(p[i]), [xj, zj] = must(p[j]); if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  for (let z = -80; z <= 80; z += 4) assert.ok(!osm.buildings.some((b: Footprint) => inside(b.poly, 0, z)), `footprint on the road at z=${z}`);
  const bad = C.set_backdrop(s, { ground: 'map' });
  assert.equal(isOk(bad), false); assert.equal(firstError(bad).path, 'map.bearing');
});

test('import_osm refuses a bad bbox and a missing Overpass answer', () => {
  const s = newScene({});
  assert.equal(firstError(C.import_osm(s, { bbox: [1.31, 103.85, 1.30, 103.86] }, { overpass })).code, 'bad_args');
  assert.equal(firstError(C.import_osm(s, { bbox: BBOX })).code, 'no_osm_data');
  done(C.import_osm(s, { bbox: BBOX }, { overpass }));
  assert.deepEqual(must(s.map).origin, { lat: 1.3089, lon: 103.85125 });
});
}
tests1();

function tests2(): void {
test('import_osm writes no data file when the scene change is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tbref-')), odblPath = join(dir, 'x.osm.json');
  const s = newScene({});
  done(C.set_backdrop(s, { ground: 'map', origin: { lat: 1.30888, lon: 103.85116 }, estimated: true, source: 'estimated' }));
  const r = C.import_osm(s, { bbox: BBOX, bearing: 35 }, { overpass, odblPath });
  assert.equal(isOk(r), false); assert.equal(firstError(r).path, 'map.bearing');
  assert.ok(!existsSync(odblPath)); assert.equal(must(s.map).osm, undefined);
});

test('export_scene writes the ODbL data file next to the exported scene', () => {
  const src = mkdtempSync(join(tmpdir(), 'tbsrc-')), out = mkdtempSync(join(tmpdir(), 'tbout-'));
  const s = newScene({});
  done(C.import_osm(s, { bbox: BBOX, bearing: 35 }, { overpass, odblPath: join(src, 'li.osm.json') }));
  const r = done<{ odbl: string }>(C.export_scene(s, { path: join(out, 'copy.toybox.json') }));
  assert.equal(r.odbl, join(out, 'li.osm.json'));
  assert.deepEqual(JSON.parse(readFileSync(r.odbl, 'utf8')), JSON.parse(readFileSync(join(src, 'li.osm.json'), 'utf8')));
});

test('export_scene keeps the MCP agent inside the scene folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tbexp-'));
  const s = newScene({});
  for (const path of ['../evil.toybox.json', '/tmp/evil.toybox.json', 'notes.txt']) assert.equal(firstError(C.export_scene(s, { path }, { exportDir: dir })).code, 'bad_path', path);
  const r = done<{ path: string }>(C.export_scene(s, { path: 'copy.toybox.json' }, { exportDir: dir }));
  assert.equal(r.path, join(dir, 'copy.toybox.json')); assert.ok(existsSync(join(dir, 'copy.srt')));
});

test('the MP4 export .srt is in time order and the same as the core .srt', () => {
  const s = newScene({}); s.captions = [{ start: 5, end: 7, text: 'second' }, { start: 1, end: 3, text: 'first' }];
  assert.equal(webSrt(s), coreSrt(s));
  assert.match(webSrt(s), /^1\n00:00:01,000/);
});
}
tests2();

function tests3(): void {
test('daemon: static files stay in their folders, host is checked, stale scene writes are refused', async (tc: TestContext) => {
  const dir = mkdtempSync(join(tmpdir(), 'tbsrv-')), scene = join(dir, 's.toybox.json');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../app/serve.ts', import.meta.url)), '--scene', scene, '--port', String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  tc.after(() => child.kill());
  const token = await new Promise<string>((ok, no) => {
    let out = ''; child.stdout.on('data', (d: Buffer) => { out += d; const m = /token=(\w+)/.exec(out); if (m?.[1]) ok(m[1]); });
    child.on('exit', () => { no(new Error('daemon stopped')); });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/viewer.html`)).status, 200);
  for (const p of ['/..%2Fapp%2Fserve.ts', '/..%2Fout%2Fmcp.json', '/assets/..%2Fapp%2Fserve.ts']) assert.equal((await fetch(base + p)).status, 403, p);
  const http = await import('node:http');
  const viaHost = await new Promise<number | undefined>((ok) => http.get({ host: '127.0.0.1', port, path: '/viewer.html', headers: { host: 'evil.example' } }, (r) => { r.resume(); ok(r.statusCode); }));
  assert.equal(viaHost, 403);
  const body = readFileSync(scene, 'utf8');
  assert.equal((await fetch(`${base}/api/scene?token=${token}&v=1`, { method: 'POST', body })).status, 409);
  const v = statSync(scene).mtimeMs;
  const ok = await fetch(`${base}/api/scene?token=${token}&v=${v}`, { method: 'POST', body });
  assert.equal(ok.status, 200); assert.equal(view<{ v: number }>(await ok.json()).v, statSync(scene).mtimeMs);
});

// a syntax error in a web module stops the viewer, so every render and export times out
test('every web script parses', () => {
  const dir = fileURLToPath(new URL('../web/', import.meta.url));
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  for (const f of ['app.ts', 'controls.ts', 'export.ts', 'headless.ts', 'viewer-app.ts', 'viewer.ts']) {
    assert.doesNotThrow(() => transpiler.transformSync(readFileSync(join(dir, f), 'utf8')), f);
  }
});
}
tests3();
