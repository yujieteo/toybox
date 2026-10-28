import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build as riot } from '../evals/riot.mjs';
import { build as home } from '../evals/hometeamns.mjs';
import { loadScene, validate } from '../core/scene.mjs';

for (const [name, build, chapters] of [['riot', riot, [12, 20]], ['hometeamns', home, [8, 10]]]) {
  test(`eval ${name}: every quality bar passes`, () => {
    const rep = build();
    const failed = rep.rows.filter((r) => !r.ok);
    assert.deepEqual(failed, []);
    const scene = loadScene(rep.file);
    assert.deepEqual(validate(scene), []);
    assert.ok(scene.chapters.length >= chapters[0] && scene.chapters.length <= chapters[1]);
  });
}

test('riot scene: 2.5 to 3 minutes, map origin, street backdrop, no names on figures', () => {
  const s = loadScene(new URL('../evals/out/riot.toybox.json', import.meta.url).pathname);
  assert.ok(s.duration >= 150 && s.duration <= 180, String(s.duration));
  assert.equal(s.backdrop.ground, 'street');
  assert.equal(s.map.origin.lat, 1.30888); assert.equal(s.map.estimated, true);
  assert.ok(s.map.osm.buildings.length > 50, 'real OpenStreetMap footprints');
  const odbl = JSON.parse(readFileSync(new URL(`../evals/out/${s.map.osm.dataFile}`, import.meta.url), 'utf8'));
  assert.equal(odbl.header.license, 'ODbL 1.0'); assert.equal(odbl.osm.buildings.length, s.map.osm.buildings.length);
  assert.ok(!s.credits.some((c) => /OpenStreetMap/.test(c)), 'the viewer adds the OpenStreetMap credit by itself');
  assert.ok(s.chapters.every((c) => /^https:\/\/en\.wikipedia\.org/.test(c.source) || /^estimated/.test(c.source)));
  assert.ok(s.objects.filter((o) => o.model === 'person').every((o) => !o.label));
  assert.ok(s.captions.every((c) => !/victim/i.test(c.text)));
  // uniformed figures wear their outfit: the SOC in riot gear, the police in police uniform, no civilian in either
  const people = s.objects.filter((o) => o.model === 'person');
  assert.ok(people.filter((o) => o.id.startsWith('soc-')).length >= 6);
  for (const o of people) {
    if (o.id.startsWith('soc-')) assert.equal(o.outfit, 'soc-riot', o.id);
    else if (o.id.startsWith('pol-')) assert.match(o.outfit, /^police/, o.id);
    else assert.equal(o.outfit, undefined, o.id);
  }
});

test('hometeamns scene: every object is labelled as estimated', () => {
  const s = loadScene(new URL('../evals/out/hometeamns.toybox.json', import.meta.url).pathname);
  assert.ok(s.objects.every((o) => o.estimated === true && o.source === 'estimated'));
  assert.equal(s.objects.filter((o) => o.model === 'person').length, 1);
});
