// MP4 export in the page: render each frame, draw the captions into it, encode with WebCodecs
// (H.264), and post the chunks to the local server. The server muxes them with ffmpeg.
// Same scene and same time always give the same pixels. The server adds the voice of the narration.
import { plain } from './vid.js';

export function srt(scene) {
  const ts = s => { const ms = Math.round(s * 1000), p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  return [...(scene.captions || [])].sort((a, b) => a.start - b.start).map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${plain(c.text)}\n`).join('\n');
}

export async function exportVideo(v, { width = 1920, height = 1080, fps = 30, name = 'scene', base = '', token = '', onprogress } = {}) {
  const dur = v.scene.duration || 60, n = Math.round(dur * fps);
  const [w0, h0] = v.size();
  const keepSel = v.selected, keepCam = v.userCam, keepPlay = v.playing;
  v.pause(); v.selected = null; v.userCam = false; v.exporting = true;
  v.resize(width, height);
  const out = document.createElement('canvas'); out.width = width; out.height = height;
  const g = out.getContext('2d');
  const gl = document.getElementById('canvas');
  await fetch(`${base}/export/start?token=${token}&name=${encodeURIComponent(name)}&fps=${fps}&w=${width}&h=${height}`, { method: 'POST', body: srt(v.scene) });
  let chain = Promise.resolve(), bytes = 0, encErr = null;
  const enc = new VideoEncoder({
    output: chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); bytes += b.length; chain = chain.then(() => fetch(`${base}/export/chunk?token=${token}`, { method: 'POST', body: b })); },
    error: e => { encErr = e; } });
  enc.configure({ codec: width * height > 1280 * 720 ? 'avc1.640028' : 'avc1.64001f', width, height, bitrate: 6e6, framerate: fps, avc: { format: 'annexb' }, latencyMode: 'quality' });
  const hashes = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    if (encErr) throw encErr;
    v.draw(i / fps);                                   // draws the scene and the overlay
    g.drawImage(gl, 0, 0, width, height);
    g.drawImage(document.getElementById('overlay'), 0, 0, width, height);
    if (i % 30 === 0) { const px = g.getImageData(0, 0, width, height).data; let h = 2166136261; for (let k = 0; k < px.length; k += 61) h = Math.imul(h ^ px[k], 16777619) >>> 0; hashes.push(h); }
    const f = new VideoFrame(out, { timestamp: Math.round(i * 1e6 / fps) });
    enc.encode(f, { keyFrame: i % 60 === 0 }); f.close();
    while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 1));
    if (onprogress && i % 15 === 0) onprogress(i / n);
  }
  await enc.flush(); await chain;
  if (encErr) throw encErr;
  const info = { frames: n, seconds: dur, fps, width, height, h264_bytes: bytes, encode_ms: Math.round(performance.now() - t0), hashes: hashes.join(',') };
  const res = await (await fetch(`${base}/export/end?token=${token}&` + new URLSearchParams(Object.entries(info).map(([k, x]) => [k, String(x)])), { method: 'POST' })).json();
  v.exporting = false; v.resize(w0, h0); v.userCam = keepCam; v.selected = keepSel; v.draw(v.t);
  if (keepPlay) v.play();
  return { ...info, ...res };
}
