// A page that the daemon opens in a headless browser, for one job: one picture or one MP4.
import { createViewer } from './viewer.js';
import { exportVideo } from './export.js';
const q = new URLSearchParams(location.search), token = q.get('token');
const api = (p, opt = {}) => fetch(`${p}${p.includes('?') ? '&' : '?'}token=${token}`, opt);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
try {
  const w = +q.get('w') || 1920, h = +q.get('h') || 1080;
  const canvas = document.getElementById('canvas'), overlay = document.getElementById('overlay');
  canvas.width = w; canvas.height = h;
  const v = await createViewer({ canvas, overlay, width: w, height: h });
  v.resize(w, h); canvas.width = w; canvas.height = h;
  const scene = await (await api('/api/scene')).json();
  v.load(scene, false);
  // Wait for the map tiles before the first captured frame. The tiles change the picture, so the
  // wait is part of the capture. A slow or blocked tile server must not hang the job: stop waiting
  // after 15 s. The OneMap logo is only a credit. It gets a short separate wait and never holds
  // the tiles back.
  await Promise.race([v.tilesReady || Promise.resolve(), sleep(15000)]);
  if (v.oneMap(scene)) await Promise.race([v.loadLogo(), sleep(5000)]);
  await document.fonts.load('500 20px "DM Sans"'); await document.fonts.load('600 20px "DM Sans"');
  if (q.get('mode') === 'frame') {
    v.draw(+q.get('t') || 0);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(canvas, 0, 0, w, h); g.drawImage(overlay, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await api('/api/frame-result?png=' + encodeURIComponent(q.get('png')), { method: 'POST', body: blob });
  } else {
    await exportVideo(v, { width: w, height: h, fps: +q.get('fps') || 30, name: q.get('name') || 'scene', token, hashes: q.get('hashes') === '1' });
  }
} catch (e) {
  await api('/api/job-error', { method: 'POST', body: String(e && e.stack || e) });
}
