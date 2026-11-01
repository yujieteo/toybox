// MP4 export in the page: render each frame, draw the captions into it, encode with WebCodecs
// (H.264), and post the chunks to the local server. The server muxes them with ffmpeg.
// Same scene and same time always give the same pixels. The server adds the voice of the narration.
import { plain } from './vid.js';

export function srt(scene) {
  const ts = s => { const ms = Math.round(s * 1000), p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  return [...(scene.captions || [])].sort((a, b) => a.start - b.start).map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${plain(c.text)}\n`).join('\n');
}

// The WebCodecs configuration for one export size and frame rate. The level follows the coded
// area: 4.0 covers 1080p30, 4.2 covers 1080p60, 5.0 covers 1440p, 5.1 covers 4K30 and 5.2 covers
// 4K60. The bitrate is 0.1 bit for each pixel and frame (6.2 Mbit/s at 1080p30, the old fixed
// value was 6 Mbit/s), with a floor of 6 Mbit/s and a ceiling of 40 Mbit/s.
const LEVEL_CODEC = { '4.0': 'avc1.640028', '4.2': 'avc1.64002a', '5.0': 'avc1.640032', '5.1': 'avc1.640033', '5.2': 'avc1.640034' };
export function encoderConfig(width, height, fps = 30) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16) throw new RangeError(`The export size ${width}x${height} is not a whole number of pixels of at least 16.`);
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new RangeError(`The export frame rate ${fps} is not a whole number from 1 to 60.`);
  const area = width * height;
  let level;
  if (area <= 1920 * 1080 && fps <= 30) level = '4.0';
  else if (area <= 1920 * 1080) level = '4.2';
  else if (area <= 2560 * 1440) level = '5.0';
  else if (area <= 3840 * 2160 && fps <= 30) level = '5.1';
  else if (area <= 3840 * 2160) level = '5.2';
  else throw new RangeError(`The browser H.264 encoder cannot encode ${width}x${height} at ${fps} frames a second. Use at most 3840x2160.`);
  const bitrate = Math.min(40e6, Math.max(6e6, Math.round(area * fps * 0.1)));
  return { codec: LEVEL_CODEC[level], level, bitrate };
}

export async function exportVideo(v, { width = 1920, height = 1080, fps = 30, name = 'scene', base = '', token = '', onprogress, hashes = false } = {}) {
  const dur = v.scene.duration || 60, n = Math.round(dur * fps);
  const [w0, h0] = v.size();
  const keepSel = v.selected, keepCam = v.userCam, keepPlay = v.playing, keepT = v.t;
  const out = document.createElement('canvas'); out.width = width; out.height = height;
  const g = out.getContext('2d');
  const gl = document.getElementById('canvas'), overlay = document.getElementById('overlay');
  let enc = null, chain = Promise.resolve(), bytes = 0, encErr = null;
  const hashList = [];
  try {
    v.pause(); v.selected = null; v.userCam = false; v.exporting = true;
    v.resize(width, height);
    const cfg = encoderConfig(width, height, fps);
    const startUrl = `${base}/export/start?token=${token}&name=${encodeURIComponent(name)}&fps=${fps}&w=${width}&h=${height}`;
    const start = await fetch(startUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ srt: srt(v.scene), scene: v.scene }) });
    if (!start.ok) {
      let message = 'The server refused the start of the export.';
      try { const j = await start.json(); if (j && j.error) message = j.error; } catch { /* the body is not JSON */ }
      throw new Error(message);
    }
    const encoder = new VideoEncoder({
      output: chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); bytes += b.length; chain = chain.then(() => fetch(`${base}/export/chunk?token=${token}`, { method: 'POST', body: b })); },
      error: e => { encErr = e; } });
    enc = encoder;
    encoder.configure({ codec: cfg.codec, width, height, bitrate: cfg.bitrate, framerate: fps, avc: { format: 'annexb' }, latencyMode: 'quality' });
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (encErr) throw encErr;
      v.draw(i / fps);                                   // draws the scene and the overlay
      g.drawImage(gl, 0, 0, width, height);
      g.drawImage(overlay, 0, 0, width, height);
      if (hashes && i % 30 === 0) { const px = g.getImageData(0, 0, width, height).data; let h = 2166136261; for (let k = 0; k < px.length; k += 61) h = Math.imul(h ^ px[k], 16777619) >>> 0; hashList.push(h); }
      const f = new VideoFrame(out, { timestamp: Math.round(i * 1e6 / fps) });
      encoder.encode(f, { keyFrame: i % 60 === 0 }); f.close();
      while (encoder.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 1));
      if (onprogress && i % 15 === 0) onprogress(i / n);
    }
    await encoder.flush(); await chain;
    if (encErr) throw encErr;
    const info = { frames: n, seconds: dur, fps, width, height, h264_bytes: bytes, encode_ms: Math.round(performance.now() - t0) };
    if (hashes) info.hashes = hashList.join(',');
    const res = await (await fetch(`${base}/export/end?token=${token}&` + new URLSearchParams(Object.entries(info).map(([k, x]) => [k, String(x)])), { method: 'POST' })).json();
    if (res && res.error) throw new Error(res.error);
    return { ...info, ...res };
  } finally {
    // Always give the viewer back, even when the export failed. The page that runs the export
    // dies after the job, but a reuse of this function must not leave the viewer in export state.
    try { if (enc && enc.state !== 'closed') enc.close(); } catch { /* already closed */ }
    v.exporting = false; v.resize(w0, h0); v.userCam = keepCam; v.selected = keepSel; v.draw(keepT);
    if (keepPlay) v.play();
  }
}
