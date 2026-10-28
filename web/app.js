// The authoring page: chat with the agent on the left, the viewer on the right. The scene file
// on disk is the source of truth. The page reloads it when it changes, and saves the edits that
// the person makes in the viewer.
import { createViewer } from './viewer.js';
import { bindControls } from './controls.js';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
let token = q.get('token');
try { if (token) sessionStorage.setItem('tb', token); else token = sessionStorage.getItem('tb'); } catch {}
const api = (p, opt) => fetch(`${p}${p.includes('?') ? '&' : '?'}token=${token}`, opt);
const status = t => { $('status').textContent = t; };

const canvas = $('canvas'), overlay = $('overlay');
const v = await createViewer({ canvas, overlay });
function fit() {
  const r = $('stage').getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(r.width * d), h = Math.round(r.height * d);
  canvas.width = w; canvas.height = h; v.resize(w, h);
  if (v.scene) v.draw(v.t);
}
new ResizeObserver(fit).observe($('stage')); fit();
bindControls(v, { canvas, ui: { play: $('play'), seek: $('seek'), time: $('time'), story: $('story'), save: $('save'), panel: $('panel'), pname: $('pname'), psrc: $('psrc') } });

let lastVersion = 0, saving = null;
async function pull() {
  const s = await (await api('/api/scene')).json();
  $('seek').max = s.duration || 60;
  const sel = v.selected;
  v.load(s);
  v.selected = s.objects.some(o => o.id === sel) ? sel : null;
  if (v.oneMap(s) && !v.logo) v.loadLogo();
  v.draw(v.t);
}
async function poll() {
  try {
    const { v: ver } = await (await api('/api/version')).json();
    if (ver !== lastVersion && !saving) { lastVersion = ver; await pull(); }
  } catch (e) { status('The Toybox daemon does not answer.'); }
  setTimeout(poll, 1000);
}
v.onedit = () => {
  clearTimeout(saving);
  saving = setTimeout(async () => {
    const r = await api(`/api/scene?v=${lastVersion}`, { method: 'POST', body: JSON.stringify(v.scene) });
    const a = await r.json(); saving = null;
    if (r.status === 409) { status(a.error); lastVersion = 0; } else if (a.v) lastVersion = a.v; else status(a.error);
  }, 400);
};
await poll();

// chat
const log = $('log');
const add = (cls, text) => { const p = document.createElement('p'); p.className = cls; p.textContent = text; log.appendChild(p); log.scrollTop = log.scrollHeight; return p; };
let ctl = null;
$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('msg').value.trim(); if (!text || ctl) return;
  $('msg').value = ''; add('me', text); $('send').disabled = true;
  ctl = new AbortController();
  try {
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text }), signal: ctl.signal });
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).replace(/^data: /, ''); buf = buf.slice(i + 2);
        const m = JSON.parse(line);
        if (m.text) add('agent', m.text); else if (m.tool) add('tool', 'Tool: ' + m.tool);
      }
    }
  } catch (err) { if (err.name !== 'AbortError') add('tool', 'The chat stopped: ' + err.message); }
  ctl = null; $('send').disabled = false;
});
$('stop').onclick = () => { if (ctl) ctl.abort(); };
$('msg').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('form').requestSubmit(); });

$('mp4').onclick = async () => {
  $('mp4').disabled = true; status('The MP4 export runs in a separate browser. It can take a minute.');
  try {
    const r = await (await api('/api/export', { method: 'POST', body: JSON.stringify({ name: (v.scene.title || 'scene').replace(/[^\w-]+/g, '-').toLowerCase() }) })).json();
    status(r.error ? r.error : `Done. Files: ${[r.mp4, r.srt, r.scene, r.odbl].filter(Boolean).join(', ')}`);
  } catch (e) { status('The export failed: ' + e.message); }
  $('mp4').disabled = false;
};
