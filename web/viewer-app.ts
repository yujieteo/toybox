// The hosted viewer page: opens a scene file, plays it, lets the visitor orbit and edit objects.
import { createViewer, type Viewer } from './viewer.js';
import { bindControls } from './controls.js';
import { upgradeScene } from './format.js';
import type { Scene } from './types.js';
import { byId, htmlById, messageOf } from './dom.js';
import { assert } from './assert.ts';

declare global { var toybox: Viewer | undefined }   // a handle for screenshots and QA
const $ = htmlById;
const canvas = byId('canvas', HTMLCanvasElement), overlay = byId('overlay', HTMLCanvasElement);
const seekBar = byId('seek', HTMLInputElement);
const q = new URLSearchParams(location.search);
const v = await createViewer({ canvas, overlay });
globalThis.toybox = v;
function fit(): void {
  assert(typeof $ === 'function');
  assert(typeof v === 'object');
  assert(typeof canvas === 'object');
  const r = $('stage').getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  v.resize(Math.round(r.width * d), Math.round(r.height * d));
  canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d);
  if (v.scene) v.draw(v.t);
}
function open(input: unknown, base: string | URL | null = null): void {   // base: the URL of the scene file. The voice files are next to it.
  assert(typeof v === 'object');
  assert(typeof $ === 'function');
  assert(typeof seekBar === 'object');
  try {
    v.voiceUrl = base ? (f: string) => {
      assert(typeof f === 'string');
      assert(f.length < 1e7);
      const returned = new URL(f, base).href;
      assert(typeof returned === 'string');
      assert(returned.length < 1e7);
      return returned;
    } : null;
    const scene: Scene = upgradeScene(input);
    if (!Array.isArray(scene.objects)) throw new Error('This is not a Toybox scene file.');
    $('err').textContent = '';
    $('title').textContent = scene.title || 'Toybox scene';
    seekBar.max = String(scene.duration || 60);
    v.undo = []; v.selected = null;
    v.load(scene, false);
    if (v.oneMap(scene)) v.loadLogo().then(() => v.draw(v.t));
  } catch (e) { $('err').textContent = messageOf(e); }
}
new ResizeObserver(fit).observe($('stage'));
fit();
bindControls(v, { canvas, ui: { play: $('play'), seek: seekBar, time: $('time'), story: $('story'), save: $('save'), panel: $('panel'), pname: $('pname'), psrc: $('psrc') } });
const fileInput = byId('file', HTMLInputElement);
fileInput.addEventListener('change', async () => {
  assert(typeof fileInput === 'object');
  const f = fileInput.files?.[0]; if (!f) return;
  try { open(JSON.parse(await f.text())); } catch { $('err').textContent = 'The file is not valid JSON.'; }
});
const src = q.get('scene');
if (src) { const url = new URL(src, location.href); open(await (await fetch(url)).json(), url); }
