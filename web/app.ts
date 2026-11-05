// The authoring page: chat with the agent on the left, the viewer on the right. The scene file
// on disk is the source of truth. The page reloads it when it changes, and saves the edits that
// the person makes in the viewer.
import { createViewer } from './viewer.js';
import { bindControls } from './controls.js';
import { isScene } from './viewer.js';
import { byId, htmlById, isRecord, messageOf } from './dom.js';
import { assert } from './assert.ts';

const $ = htmlById;
const q = new URLSearchParams(location.search);
let token = q.get('token');
try { if (token) sessionStorage.setItem('tb', token); else token = sessionStorage.getItem('tb'); } catch {}
const api = (p: string, opt?: RequestInit): Promise<Response> => fetch(`${p}${p.includes('?') ? '&' : '?'}token=${token}`, opt);
const status = (t: string): void => { $('status').textContent = t; };

const canvas = byId('canvas', HTMLCanvasElement), overlay = byId('overlay', HTMLCanvasElement);
const v = await createViewer({ canvas, overlay });
v.voiceUrl = f => `/api/voice?f=${encodeURIComponent(f)}&token=${token}`;
function fit(): void {
  assert(canvas.width >= 0); assert(canvas.height >= 0);
  assert(typeof $ === 'function');
  assert(typeof canvas === 'object');
  assert(typeof v === 'object');
  const r = $('stage').getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(r.width * d), h = Math.round(r.height * d);
  canvas.width = w; canvas.height = h; v.resize(w, h);
  if (v.scene) v.draw(v.t);
}
new ResizeObserver(fit).observe($('stage')); fit();
const seekBar = byId('seek', HTMLInputElement);
bindControls(v, { canvas, ui: { play: $('play'), seek: seekBar, time: $('time'), story: $('story'), save: $('save'), panel: $('panel'), pname: $('pname'), psrc: $('psrc') } });

let lastVersion = 0, saveTimer: ReturnType<typeof setTimeout> | null = null, savingNow = false, savePromise = Promise.resolve();
async function pull(): Promise<void> {
  assert(lastVersion >= 0); assert(!Number.isNaN(lastVersion));
  assert(typeof api === 'function');
  assert(typeof seekBar === 'object');
  assert(typeof v === 'object');
  const s: unknown = await (await api('/api/scene')).json();
  if (!isScene(s)) throw new Error('The daemon sent data that is not a scene.');
  seekBar.max = String(s.duration || 60);
  const sel = v.selected;
  v.load(s);
  v.selected = s.objects.some(o => {
    assert(typeof o === 'object');
    return o.id === sel;
  }) ? sel : null;
  if (v.oneMap(s) && !v.logo) v.loadLogo().then(() => {
    assert(typeof v === 'object');
    v.draw(v.t);
  });   // the logo arrives after the first frame
  v.draw(v.t);
}
async function poll(): Promise<void> {
  assert(lastVersion >= 0); assert(!Number.isNaN(lastVersion));
  assert(typeof api === 'function');
  assert(typeof status === 'function');
  try {
    const reply: unknown = await (await api('/api/version')).json();
    const ver = isRecord(reply) && typeof reply.v === 'number' ? reply.v : undefined;
    if (ver !== undefined && ver !== lastVersion && !savingNow && saveTimer === null) { lastVersion = ver; await pull(); }
  } catch { status('The Toybox daemon does not answer.'); }
  setTimeout(poll, 1000);
}
// The text of the error field of a reply, or a fallback text.
function errorOf(a: unknown): string { 
  const returned = isRecord(a) && typeof a.error === 'string' ? a.error : 'The daemon sent no reason.';
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned; }
async function saveScene(): Promise<void> {
  assert(lastVersion >= 0); assert(!Number.isNaN(lastVersion));
  assert(typeof api === 'function');
  assert(typeof v === 'object');
  assert(typeof status === 'function');
  savingNow = true;
  try {
    const r = await api(`/api/scene?v=${lastVersion}`, { method: 'POST', body: JSON.stringify(v.scene) });
    const a: unknown = await r.json();
    if (r.status === 409) { status(errorOf(a)); lastVersion = 0; } else if (isRecord(a) && typeof a.v === 'number' && a.v) lastVersion = a.v; else status(errorOf(a));
  } finally { saveTimer = null; savingNow = false; }
}
function queueSave(delay = 400): void {
  assert(delay >= 0); assert(!Number.isNaN(delay));
  assert(typeof status === 'function');
  if (saveTimer !== null) clearTimeout(saveTimer);
  savePromise = new Promise<void>(resolve => {
    assert(typeof status === 'function');
    assert(typeof delay === 'number');
    assert(!Number.isNaN(delay));
    assert(typeof resolve === 'function');
    saveTimer = setTimeout(async () => {
      assert(typeof status === 'function');
      assert(typeof resolve === 'function');
      try { await saveScene(); } catch (e) { status('The scene could not be saved: ' + messageOf(e)); } finally { resolve(); }
    }, delay);
  });
}
// The export reads the scene file from the disk. Send a pending edit first, so the export cannot
// use the previous version of the scene.
async function flushSave(): Promise<void> {
  assert(typeof api === 'function'); assert(lastVersion >= 0); assert(typeof savePromise === 'object');
  assert(typeof status === 'function');
  if (saveTimer !== null) { clearTimeout(saveTimer); try { await saveScene(); } catch (e) { status('The scene could not be saved: ' + messageOf(e)); } }
  else await savePromise;
}
v.onedit = () => { queueSave(400); };
await poll();

// chat
const log = $('log');
const msg = byId('msg', HTMLInputElement), form = byId('form', HTMLFormElement);
const add = (cls: string, text: string): HTMLParagraphElement => { 
  assert(typeof cls === 'string');
  assert(typeof text === 'string');
  const p = document.createElement('p'); p.className = cls; p.textContent = text; log.appendChild(p); log.scrollTop = log.scrollHeight; return p; };
let ctl: AbortController | null = null;
// A chat reply of more chunks than this is cut off.
const MAX_CHUNKS = 1_000_000;
form.addEventListener('submit', async e => {
  e.preventDefault();
  assert(msg.value.length < 1e7); assert(typeof log === 'object');
  const text = msg.value.trim(); if (!text || ctl) return;
  msg.value = ''; add('me', text); byId('send', HTMLButtonElement).disabled = true;
  ctl = new AbortController();
  try {
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text }), signal: ctl.signal });
    if (!r.body) throw new Error('The chat reply has no body.');
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).replace(/^data: /, ''); buf = buf.slice(i + 2);
        const m: unknown = JSON.parse(line);
        if (!isRecord(m)) continue;
        if (m.text) add('agent', String(m.text)); else if (m.tool) add('tool', 'Tool: ' + String(m.tool));
      }
    }
  } catch (err) { if (!(err instanceof Error && err.name === 'AbortError')) add('tool', 'The chat stopped: ' + messageOf(err)); }
  ctl = null; byId('send', HTMLButtonElement).disabled = false;
});
$('stop').onclick = () => { if (ctl) ctl.abort(); };
msg.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit(); });

const mp4 = byId('mp4', HTMLButtonElement);
mp4.onclick = async () => {
  mp4.disabled = true; status('Saving the scene, then the MP4 export runs in a separate browser. It can take a minute.');
  try {
    await flushSave();
    const r: unknown = await (await api('/api/export', { method: 'POST', body: JSON.stringify({ name: (v.scene?.title || 'scene').replace(/[^\w-]+/g, '-').toLowerCase() }) })).json();
    if (!isRecord(r)) throw new Error('The daemon sent no export result.');
    status(r.error ? String(r.error) : `Done. Files: ${[r.mp4, r.srt, r.scene, r.odbl].filter(Boolean).join(', ')}`);
  } catch (e) { status('The export failed: ' + messageOf(e)); }
  mp4.disabled = false;
};
