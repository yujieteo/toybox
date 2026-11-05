import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { build as riot } from '../evals/riot.ts';
import { build as home } from '../evals/hometeamns.ts';
import { build as narrated } from '../evals/narrated.ts';
import { build as mrt } from '../evals/mrt.ts';
import { loadScene, validate } from '../core/scene.ts';
import { must, view } from './helpers.ts';

interface Odbl { header: { license: string }; osm: { buildings: unknown[] } }
interface Report { file: string; rows: { ok: boolean }[] }
const evals: [string, () => Report, [number, number]][] = [['riot', riot, [12, 20]], ['hometeamns', home, [8, 10]], ['narrated', narrated, [2, 2]], ['mrt', mrt, [8, 10]]];

for (const [name, build, chapters] of evals) {
  test(`eval ${name}: every quality bar passes`, { timeout: 300000 }, () => {
    const rep = build();
    const failed = rep.rows.filter((r) => !r.ok);
    assert.deepEqual(failed, []);
    const scene = loadScene(rep.file);
    assert.deepEqual(validate(scene), []);
    assert.ok(scene.chapters.length >= chapters[0] && scene.chapters.length <= chapters[1]);
  });
}

test('riot scene: 2.5 to 3 minutes, map origin, street backdrop, no names on figures', () => {
  const s = loadScene(fileURLToPath(new URL('../evals/out/riot.toybox.json', import.meta.url)));
  assert.ok(s.duration >= 150 && s.duration <= 180, String(s.duration));
  assert.equal(s.backdrop.ground, 'street');
  const map = must(s.map), osm = must(map.osm);
  assert.equal(must(map.origin).lat, 1.30888); assert.equal(Object.entries(map).find(([k]) => k === 'estimated')?.[1], true);
  assert.ok(osm.buildings.length > 50, 'real OpenStreetMap footprints');
  const odbl = view<Odbl>(JSON.parse(readFileSync(new URL(`../evals/out/${must(osm.dataFile)}`, import.meta.url), 'utf8')));
  assert.equal(odbl.header.license, 'ODbL 1.0'); assert.equal(odbl.osm.buildings.length, osm.buildings.length);
  assert.ok(!s.credits.some((c) => /OpenStreetMap/.test(c)), 'the viewer adds the OpenStreetMap credit by itself');
  assert.ok(s.chapters.every((c) => /^https:\/\/en\.wikipedia\.org/.test(must(c.source)) || /^estimated/.test(must(c.source))));
  assert.ok(s.objects.filter((o) => o.model === 'person').every((o) => !o.label));
  assert.ok(s.captions.every((c) => !/victim/i.test(c.text)));
  // the Committee of Inquiry met in a building: its chapter has its own room, far from the street
  const coi = must(s.objects.find((o) => o.id === 'coi-sign')), coiAt = must(coi.at);
  assert.ok(Math.hypot(coiAt[0], coiAt[2]) > 200, JSON.stringify(coi.at));
  assert.ok(must(must(s.chapters.at(-1)).focus).includes('coi-sign') && !s.chapters.slice(0, -1).some((c) => must(c.focus).includes('coi-sign')));
  // uniformed figures wear their outfit: the SOC in riot gear, the police in police uniform, no civilian in either
  const people = s.objects.filter((o) => o.model === 'person');
  assert.ok(people.filter((o) => o.id.startsWith('soc-')).length >= 6);
  for (const o of people) {
    if (o.id.startsWith('soc-')) assert.equal(o.outfit, 'soc-riot', o.id);
    else if (o.id.startsWith('pol-')) assert.match(must(o.outfit), /^police/, o.id);
    else assert.equal(o.outfit, undefined, o.id);
  }
});

test('hometeamns scene: every object is labelled as estimated', () => {
  const s = loadScene(fileURLToPath(new URL('../evals/out/hometeamns.toybox.json', import.meta.url)));
  assert.ok(s.objects.every((o) => o.estimated === true && o.source === 'estimated'));
  assert.equal(s.objects.filter((o) => o.model === 'person').length, 1);
});

test('narrated scene: the voice sets the beats, and the motion words follow the words', () => {
  const s = loadScene(fileURLToPath(new URL('../evals/out/narrated.toybox.json', import.meta.url)));
  const narration = must(s.narration), facts = must(s.facts);
  assert.ok(narration.every((n) => n.voice && existsSync(new URL(`../evals/out/${n.voice}`, import.meta.url))));
  assert.ok(facts.every((f) => /^https:\/\//.test(must(f.source))));
  assert.ok(narration.flatMap((n) => n.facts || []).every((f) => facts.some((x) => x.id === f)));
  assert.deepEqual(s.captions.map((c) => c.text), narration.map((n) => n.text));
  const motions = must(s.motions);
  assert.ok(motions.length >= 8 && motions.every((m) => m.cue));
  assert.ok(s.callouts.some((c) => c.text.includes('^{st}')));
});

test('mrt scene: a narrated Singapore platform boarding story', () => {
  const s = loadScene(fileURLToPath(new URL('../web/scenes/mrt/mrt.toybox.json', import.meta.url)));
  const narration = must(s.narration), facts = must(s.facts);
  assert.ok(s.duration >= 45 && s.duration <= 75, String(s.duration));
  assert.ok(s.chapters.length >= 8 && s.chapters.length <= 10);
  assert.ok(narration.length >= 8 && narration.length <= 12);
  assert.ok(narration.every((n) => n.voice && existsSync(new URL(`../web/scenes/mrt/${n.voice}`, import.meta.url))));
  assert.ok(facts.every((f) => /^https:\/\//.test(must(f.source))));
  assert.ok(narration.flatMap((n) => n.facts || []).every((f) => facts.some((x) => x.id === f)));
  assert.deepEqual(s.captions.map((c) => c.text), narration.map((n) => n.text));
  const people = s.objects.filter((o) => o.model === 'person');
  assert.ok(people.length >= 12, `${people.length} people`);
  assert.ok(people.filter((o) => o.id === 'main').length === 1);
  assert.ok(s.objects.some((o) => o.model === 'mrt-train-car'));
  assert.ok(s.objects.filter((o) => o.model === 'psd-bay').length >= 3);
  assert.deepEqual(validate(s), []);
  // the commuter walks in through the open doors and stands clear inside the car
  const mainAt = must(s.tracks.find((t) => t.object === 'main' && t.channel === 'at'));
  const last = must(mainAt.keys.at(-1)).v;
  assert.ok(Array.isArray(last) && must(last[2]) < -2.2, `main ends inside the car at z ${JSON.stringify(last)}`);
  // the platform door leaves move on a word of the narration
  const leaf = must(s.tracks.find((t) => t.object === 'psd-3-leaf-l' && t.channel === 'at'));
  assert.ok(leaf.keys.some((k) => k.cue), 'the door leaf follows a cue');
});
