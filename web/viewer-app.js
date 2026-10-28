// The hosted viewer page: opens a scene file, plays it, lets the visitor orbit and edit objects.
import { createViewer } from './viewer.js';
import { bindControls } from './controls.js';

const $ = id => document.getElementById(id);
const canvas = $('canvas'), overlay = $('overlay');
const q = new URLSearchParams(location.search);
const v = await createViewer({ canvas, overlay, engineUrl: q.get('engine') || 'engine/toybox.js', assetsUrl: q.get('assets') || 'assets' });
globalThis.toybox = v;
function fit() {
  const r = $('stage').getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  v.resize(Math.round(r.width * d), Math.round(r.height * d));
  canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d);
  if (v.scene) v.draw(v.t);
}
function open(scene) {
  try {
    if (scene.toybox !== 1 || !Array.isArray(scene.objects)) throw new Error('This is not a Toybox scene file.');
    $('err').textContent = '';
    $('title').textContent = scene.title || 'Toybox scene';
    $('seek').max = scene.duration || 60;
    v.undo = []; v.selected = null;
    v.load(scene, false);
    if (scene.map && scene.map.onemap) v.loadLogo().then(() => v.draw(v.t));
  } catch (e) { $('err').textContent = e.message; }
}
new ResizeObserver(fit).observe($('stage'));
fit();
bindControls(v, { canvas, ui: { play: $('play'), seek: $('seek'), time: $('time'), story: $('story'), save: $('save'), panel: $('panel'), pname: $('pname'), psrc: $('psrc') } });
$('file').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { open(JSON.parse(await f.text())); } catch (err) { $('err').textContent = 'The file is not valid JSON.'; }
});
const src = q.get('scene');
if (src) open(await (await fetch(src)).json());
