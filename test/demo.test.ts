// The MRT demo page: its files, its scene, its voices and the step logic that the page uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadScene, validate } from '../core/scene.ts';
import { plain } from '../web/vid.js';
import { SCENE_URL, chapterSteps, activeStep } from '../web/demo.js';
import { must } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const page = (name: string): string => join(root, 'web', name);
const scenePath = join(root, 'web', SCENE_URL);
const sceneDir = dirname(scenePath);

test('the demo page files exist', () => {
  for (const name of ['demo.html', 'demo.ts', 'viewer.ts', 'controls.ts', 'format.ts', 'ui.css', 'ui-components.css']) {
    assert.ok(existsSync(page(name)), `web/${name} is missing`);
  }
});

test('the page loads the demo scene through the shared viewer and UI', () => {
  const html = readFileSync(page('demo.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="ui\.css">/);
  assert.match(html, /<link rel="stylesheet" href="ui-components\.css">/);
  assert.match(html, /<script type="module" src="demo\.js"><\/script>/);
  // The element ids that bindControls in web/controls.js needs.
  for (const id of ['canvas', 'overlay', 'play', 'seek', 'time', 'story', 'save', 'panel', 'pname', 'psrc']) {
    assert.match(html, new RegExp(`id="${id}"`), `the page has no element with id="${id}"`);
  }
  const js = readFileSync(page('demo.ts'), 'utf8');
  assert.match(js, /scenes\/mrt\/mrt\.toybox\.json/, 'the page names the demo scene');
  assert.match(js, /from '\.\/viewer\.js'/);
  assert.match(js, /from '\.\/controls\.js'/);
  assert.match(js, /voiceUrl/, 'the page sets the voice files of the narration');
  assert.match(js, /globalThis\.toybox = v/, 'the page exposes the viewer as a handle for QA');
  assert.match(js, /\.get\('t'\)/, 'the page reads ?t=<seconds>');
  assert.match(js, /\.get\('play'\)/, 'the page reads ?play=1');
});

test('the demo scene loads with no validation errors', () => {
  assert.ok(existsSync(scenePath), `web/${SCENE_URL} is missing. Build the scene with node evals/mrt.ts.`);
  const scene = loadScene(scenePath);
  assert.deepEqual(validate(scene), []);
  assert.ok(scene.duration > 0, `duration ${scene.duration}`);
  assert.ok(scene.chapters.length >= 8 && scene.chapters.length <= 10, `${scene.chapters.length} chapters`);
});

test('each narration sentence has its voice file next to the scene', () => {
  const scene = loadScene(scenePath);
  const narration = scene.narration ?? [];
  assert.ok(Array.isArray(scene.narration) && narration.length > 0, 'the demo scene is narrated');
  for (const sentence of narration) {
    const voice = must(sentence.voice, `voice of "${sentence.text}"`);
    assert.match(voice, /^voice\/[0-9a-f]{12}\.wav$/, `voice file of "${sentence.text}"`);
    const file = join(sceneDir, voice);
    assert.ok(existsSync(file), `missing voice file web/scenes/mrt/${voice}`);
    assert.ok(statSync(file).size > 44, `${voice} is too short to be a WAV file`);
    assert.equal(readFileSync(file).subarray(0, 4).toString('latin1'), 'RIFF', `${voice} is not a WAV file`);
  }
});

test('every chapter becomes one step of the page, and every sentence is in a step', () => {
  const scene = loadScene(scenePath);
  const steps = chapterSteps(scene);
  assert.equal(steps.length, scene.chapters.length);
  scene.chapters.forEach((chapter, i) => {
    const step = must(steps[i], `step ${i}`);
    assert.equal(step.index, i);
    assert.equal(step.start, chapter.start);
    assert.equal(step.title, chapter.title ? plain(chapter.title) : `Step ${i + 1}`);
    assert.equal(activeStep(steps, (chapter.start + chapter.end) / 2), i, `chapter ${chapter.id} is the active step at its middle`);
  });
  // No caption falls between two chapters: each sentence shows in exactly one step.
  for (const caption of scene.captions) {
    const inside = steps.filter((step) => caption.start >= step.start && caption.start < step.end);
    assert.equal(inside.length, 1, `caption at ${caption.start} s is in ${inside.length} steps`);
    assert.ok(must(inside[0]).sentences.includes(plain(caption.text)), `caption at ${caption.start} s shows in its step`);
  }
});
