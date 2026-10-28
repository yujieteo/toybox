import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(s.map.origin.lat, 1.3068); assert.equal(s.map.estimated, true);
  assert.ok(s.chapters.every((c) => /^https:\/\/en\.wikipedia\.org/.test(c.source) || /^estimated/.test(c.source)));
  assert.ok(s.objects.filter((o) => o.model === 'person').every((o) => !o.label));
  assert.ok(s.captions.every((c) => !/victim/i.test(c.text)));
});

test('hometeamns scene: every object is labelled as estimated', () => {
  const s = loadScene(new URL('../evals/out/hometeamns.toybox.json', import.meta.url).pathname);
  assert.ok(s.objects.every((o) => o.estimated === true && o.source === 'estimated'));
  assert.equal(s.objects.filter((o) => o.model === 'person').length, 1);
});
