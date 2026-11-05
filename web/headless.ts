// A page that the daemon opens in a headless browser, for one job: one picture or one MP4.
import { createViewer } from './viewer.js';
import { exportVideo } from './export.js';
import { isScene } from './viewer.js';
import { byId, context2d } from './dom.js';
import { assert } from './assert.ts';
const q = new URLSearchParams(location.search), token = q.get('token');
const api = (p: string, opt: RequestInit = {}): Promise<Response> => {
  assert(typeof p === 'string');
  assert(p.length < 1e7);
  return fetch(`${p}${p.includes('?') ? '&' : '?'}token=${token}`, opt);
};
const sleep = (ms: number): Promise<void> => {
  assert(typeof ms === 'number');
  assert(!Number.isNaN(ms));
  return new Promise(r => {
  assert(typeof ms === 'number');
  assert(!Number.isNaN(ms));
  assert(typeof r === 'function');
  return setTimeout(r, ms);
});
};
try {
  const w = Number(q.get('w')) || 1920, h = Number(q.get('h')) || 1080;
  const canvas = byId('canvas', HTMLCanvasElement), overlay = byId('overlay', HTMLCanvasElement);
  canvas.width = w; canvas.height = h;
  const v = await createViewer({ canvas, overlay, width: w, height: h });
  v.resize(w, h); canvas.width = w; canvas.height = h;
  const scene: unknown = await (await api('/api/scene')).json();
  if (!isScene(scene)) throw new Error('The daemon sent data that is not a scene.');
  v.load(scene, false);
  // Wait for the map tiles before the first captured frame. The tiles change the picture, so the
  // wait is part of the capture. A slow or blocked tile server must not hang the job: stop waiting
  // after 15 s. The OneMap logo is only a credit. It gets a short separate wait and never holds
  // the tiles back.
  await Promise.race([v.tilesReady || Promise.resolve(), sleep(15000)]);
  if (v.oneMap(scene)) await Promise.race([v.loadLogo(), sleep(5000)]);
  await document.fonts.load('500 20px "DM Sans"'); await document.fonts.load('600 20px "DM Sans"');
  if (q.get('mode') === 'frame') {
    v.draw(Number(q.get('t')) || 0);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = context2d(c); g.drawImage(canvas, 0, 0, w, h); g.drawImage(overlay, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(r => {
      assert(typeof c === 'object');
      assert(typeof r === 'function');
      c.toBlob(r, 'image/png');
    });
    await api('/api/frame-result?png=' + encodeURIComponent(q.get('png') ?? ''), { method: 'POST', body: blob });
  } else {
    await exportVideo(v, { width: w, height: h, fps: Number(q.get('fps')) || 30, name: q.get('name') || 'scene', token, hashes: q.get('hashes') === '1' });
  }
} catch (e) {
  await api('/api/job-error', { method: 'POST', body: String(e instanceof Error && e.stack || e) });
}
