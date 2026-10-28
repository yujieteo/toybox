import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commands as C } from '../core/commands.mjs';
import { newScene, blockedViews, loadCatalogue } from '../core/scene.mjs';

const must = (r) => { assert.ok(r.ok, JSON.stringify(r)); return r.result; };
// A person at the origin, a shophouse 8 m to the south, and one chapter on the person.
function street() {
  const s = newScene({ ground: 'street' });
  must(C.place(s, { model: 'person', at: [0, 0], id: 'p', variant: 1 }));
  must(C.place(s, { model: 'shophouse-2', at: [0, 0, 8], id: 'house' }));
  must(C.add_chapter(s, { start: 0, end: 4, title: 'One', caption: 'A person stands in the street.', focus: ['p'], source: 'test' }));
  return s;
}

test('a building between the camera and the focus object is a blocked view', () => {
  const s = street();
  must(C.set_camera(s, { t: 0, shot: 'medium', eye: [0, 3, 20], target: [0, 1, 0] }));
  const errs = blockedViews(s);
  assert.ok(errs.length && errs.every((e) => e.code === 'view_blocked'));
  assert.match(errs[0].message, /house hides focus object p from 0\.00 s to 4\.00 s/);
  assert.match(errs[1].message, /house covers more than 20 percent of the frame/);
  assert.ok(must(C.validate(s, {})).errors.some((e) => e.code === 'view_blocked'));
  must(C.set_camera(s, { t: 0, shot: 'medium', eye: [0, 3, -20], target: [0, 1, 0] }));
  assert.deepEqual(blockedViews(s), []);
});

test('an OpenStreetMap footprint blocks the view like a model', () => {
  const s = street();
  must(C.remove(s, { id: 'house' }));
  s.map = { origin: { lat: 1.3, lon: 103.8 }, osm: { buildings: [{ id: 'w1', height: 12, poly: [[-6, 6], [6, 6], [6, 12], [-6, 12]] }] } };
  must(C.set_camera(s, { t: 0, shot: 'medium', eye: [0, 3, 20], target: [0, 1, 0] }));
  assert.match(blockedViews(s)[0].message, /osm:w1 hides focus object p/);
});

test('a short block (one moment) passes, a long one fails', () => {
  const s = street();
  must(C.place(s, { model: 'bus-private', at: [-30, 0, 4], id: 'bus', yaw: 90 }));
  must(C.set_camera(s, { t: 0, shot: 'medium', eye: [0, 1.5, 12], target: [0, 1, 0] }));
  must(C.remove(s, { id: 'house' }));
  // the bus drives across the line of sight at 30 m/s: hidden for about 0.4 s
  must(C.move_along(s, { id: 'bus', path: [[-30, 4], [30, 4]], times: [0, 2] }));
  assert.deepEqual(blockedViews(s), []);
  must(C.move_along(s, { id: 'bus', path: [[-30, 4], [30, 4]], times: [0, 4] }));
  assert.match(blockedViews(s)[0].message, /bus hides focus object p/);
});

test('set_camera reports a blocked view and gives clear views that work', () => {
  const s = street();
  const r = must(C.set_camera(s, { t: 0, shot: 'medium', frame: ['p'], view: 0 }));
  assert.deepEqual(r.blocked[0], { id: 'p', by: 'house' });
  assert.ok(r.clear_views.length > 0);
  const { view, elevation } = r.clear_views[0];
  const ok = must(C.set_camera(s, { t: 0, shot: 'medium', frame: ['p'], view, elevation }));
  assert.equal(ok.blocked, undefined);
  assert.deepEqual(blockedViews(s), []);
});

test('set_camera and validate agree when a framed object is not a chapter focus', () => {
  const s = street();
  must(C.remove(s, { id: 'house' }));
  must(C.place(s, { model: 'bus-private', at: [0, 0, 4], id: 'bus', yaw: 90 }));
  const r = must(C.set_camera(s, { t: 0, shot: 'medium', frame: ['p', 'bus'], view: 0, elevation: 5 }));
  assert.ok(r.blocked.some((b) => b.id === 'p' && b.by === 'bus'), JSON.stringify(r.blocked));
  assert.ok(blockedViews(s).some((e) => /bus hides focus object p/.test(e.message)));
  const { view, elevation } = r.clear_views[0];
  const ok = must(C.set_camera(s, { t: 0, shot: 'medium', frame: ['p', 'bus'], view, elevation }));
  assert.equal(ok.blocked, undefined);
  assert.deepEqual(blockedViews(s), []);
});

test('set_camera at a chapter boundary checks the chapter that starts there', () => {
  const s = street();
  must(C.place(s, { model: 'person', at: [20, 0], id: 'q', variant: 2 }));
  must(C.place(s, { model: 'shophouse-2', at: [20, 0, 8], id: 'h2' }));
  must(C.add_chapter(s, { start: 4, end: 8, title: 'Two', caption: 'A second person stands in the street.', focus: ['q'], source: 'test' }));
  const r = must(C.set_camera(s, { t: 4, shot: 'medium', eye: [20, 3, 20], target: [20, 1, 0] }));
  assert.ok(r.blocked.some((b) => b.id === 'q' && b.by === 'h2'), JSON.stringify(r.blocked));
  assert.ok(!r.blocked.some((b) => b.id === 'p'));
});

test('outfits: listed with sources, on known bones, and checked on place', () => {
  const s = newScene({});
  const { outfits } = must(C.list_models(s, {}));
  assert.deepEqual(outfits.map((f) => f.id).sort(), ['police', 'police-shield', 'soc-riot']);
  assert.ok(outfits.every((f) => /^https:\/\//.test(f.source)));
  const bones = new Set(JSON.parse(readFileSync(new URL('../assets/people/skel.json', import.meta.url), 'utf8')).bones.map((b) => b.name));
  const cat = loadCatalogue();
  for (const f of cat.outfits) for (const p of f.parts) assert.ok(bones.has(p.bone), `${f.id} ${p.bone}`);
  const soc = cat.outfits.find((f) => f.id === 'soc-riot'), pol = cat.outfits.find((f) => f.id === 'police');
  assert.notEqual(soc.colors.shirt, pol.colors.shirt);
  must(C.place(s, { model: 'person', at: [0, 0], id: 'o', outfit: 'soc-riot' }));
  assert.equal(s.objects[0].outfit, 'soc-riot');
  assert.equal(s.objects[0].colors, undefined, 'the outfit gives the colours');
  const bad = C.place(s, { model: 'person', at: [3, 0], outfit: 'clown' });
  assert.equal(bad.ok, false); assert.match(bad.errors[0].message, /Unknown outfit "clown"/);
  const g = must(C.place_group(s, { model: 'person', count: 3, at: [0, 0, 6], outfit: 'police', seed: 2 }));
  assert.ok(g.ids.every((id) => { const o = s.objects.find((x) => x.id === id); return o.outfit === 'police' && !o.colors; }));
});
