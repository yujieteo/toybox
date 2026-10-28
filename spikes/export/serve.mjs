// Spike 1 export server: serves the wasm renderer, receives raw RGBA frames
// from the page, and pipes them to ffmpeg. Usage: node serve.mjs OUTDIR
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const out = process.argv[2];
const build = process.argv[3];
const here = path.dirname(new URL(import.meta.url).pathname);
let h264 = null, ff = null, frames = 0, t0 = 0, cfg = null;

function start(q) {
  cfg = { w: +q.get('w'), h: +q.get('h'), fps: +q.get('fps'), name: q.get('name') };
  fs.writeFileSync(path.join(out, cfg.name + '.srt'),
    '1\n00:00:00,500 --> 00:00:03,000\nA crowd walks in rings around the square.\n\n' +
    '2\n00:00:03,500 --> 00:00:06,000\nThe camera orbits slowly.\n');
  if (q.get('codec')) { h264 = fs.createWriteStream(path.join(out, cfg.name + '.h264')); frames = 0; t0 = Date.now(); return; }
  ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${cfg.w}x${cfg.h}`, '-r', String(cfg.fps), '-i', '-',
    '-vf', `vflip,subtitles=${path.join(out, cfg.name + '.srt')}:force_style='FontSize=18,Outline=1'`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(out, cfg.name + '.mp4')],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  frames = 0; t0 = Date.now();
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/start') { start(u.searchParams); res.end('ok'); return; }
  if (u.pathname === '/frame') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const ok = ff.stdin.write(Buffer.concat(chunks));
      frames++;
      if (ok) res.end('ok'); else ff.stdin.once('drain', () => res.end('ok'));
    });
    return;
  }
  if (u.pathname === '/result') { fs.writeFileSync(path.join(out, u.searchParams.get('name') + '.json'), JSON.stringify(Object.fromEntries(u.searchParams), null, 1)); res.end('ok'); return; }
  if (u.pathname === '/chunk') {
    const chunks = []; req.on('data', c => chunks.push(c));
    req.on('end', () => { h264.write(Buffer.concat(chunks)); frames++; res.end('ok'); });
    return;
  }
  if (u.pathname === '/end' && h264) {
    h264.end(() => {
      const base = path.join(out, cfg.name), t1 = Date.now();
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-r', String(cfg.fps), '-f', 'h264', '-i', base + '.h264',
        '-vf', `subtitles=${base}.srt:force_style='FontSize=18,Outline=1'`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', base + '.mp4']);
      const info = Object.fromEntries(u.searchParams);
      info.chunks_posted = frames; info.caption_pass_ms = Date.now() - t1; info.total_ms = Date.now() - t0;
      info.ffmpeg_status = r.status; info.ffmpeg_err = String(r.stderr);
      fs.writeFileSync(base + '.json', JSON.stringify(info, null, 1));
      h264 = null; res.end(JSON.stringify(info));
    });
    return;
  }
  if (u.pathname === '/end') {
    ff.stdin.end();
    ff.on('close', () => {
      const info = Object.fromEntries(u.searchParams);
      info.frames_posted = frames;
      info.total_ms = Date.now() - t0;
      fs.writeFileSync(path.join(out, cfg.name + '.json'), JSON.stringify(info, null, 1));
      res.end(JSON.stringify(info));
    });
    return;
  }
  const file = u.pathname === '/' ? 'page.html' : u.pathname.slice(1);
  const p = fs.existsSync(path.join(build, file)) ? path.join(build, file) : path.join(here, file);
  if (!fs.existsSync(p)) { res.statusCode = 404; res.end('no'); return; }
  const type = file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
  res.setHeader('content-type', type);
  fs.createReadStream(p).pipe(res);
}).listen(8801, '127.0.0.1', () => console.log('listening 8801'));
