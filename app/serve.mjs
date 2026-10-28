// The Toybox daemon. It serves the page, holds the scene file, runs the chat agent through the
// MCP server, and renders pictures and videos with a headless browser.
// Run: node app/serve.mjs --scene PATH --engine BUILD_DIR [--port 8820]
// It listens on 127.0.0.1 only. Every /api and /export call needs the token that it prints.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeSceneOdbl } from '../core/osm.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const scenePath = path.resolve(args.scene || 'scene.toybox.json');
const engineDir = path.resolve(args.engine || path.join(root, 'engine-build'));
const port = +(args.port || 8820);
const outDir = path.resolve(args.out || path.join(path.dirname(scenePath), 'out'));
const chrome = process.env.TOYBOX_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const token = crypto.randomBytes(16).toString('hex');
fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(scenePath)) fs.writeFileSync(scenePath, JSON.stringify({ toybox: 1, title: 'Untitled', duration: 30, backdrop: { ground: 'grass', size: [80, 80] }, objects: [], tracks: [], camera: [{ t: 0, eye: [0, 8, 16], target: [0, 1, 0], fov: 50 }], captions: [], callouts: [], chapters: [], credits: [] }, null, 2));

const types = { '.wav': 'audio/wav', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.ttf': 'font/ttf', '.png': 'image/png', '.mp4': 'video/mp4', '.txt': 'text/plain' };
const origin = `http://127.0.0.1:${port}`;
const pids = new Set();     // the PIDs of the child processes that this daemon started
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
const authed = (req, u) => (req.headers['x-toybox-token'] || u.searchParams.get('token')) === token
  && (!req.headers.origin || req.headers.origin === origin);

// ---- jobs in a headless browser. A job page posts its result back to this daemon.
let job = null;     // { kind, resolve, h264, ffmpeg... }
function runBrowser(query, timeoutMs) {
  const profile = fs.mkdtempSync(path.join(outDir, '.profile-'));
  const child = spawn(chrome, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-swiftshader', '--window-size=1920,1080', '--hide-scrollbars',
    `${origin}/headless.html?token=${token}&${query}`], { stdio: 'ignore' });
  pids.add(child.pid);
  const mine = job;
  return new Promise((resolve) => {
    mine.resolve = (v) => { clearTimeout(timer); stop(); resolve(v); };
    const stop = () => { try { process.kill(child.pid); } catch {} pids.delete(child.pid); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500); };
    const timer = setTimeout(() => mine.resolve({ error: 'The browser job took too long.' }), timeoutMs);
    child.on('exit', () => setTimeout(() => { if (job === mine) mine.resolve({ error: 'The browser stopped before the job ended.' }); }, 300));
  });
}
async function oneJob(kind, query, timeoutMs) {
  if (job) return { error: 'Another render or export is running. Wait for it to end.' };
  job = { kind };
  try { return await runBrowser(query, timeoutMs); } finally { job = null; }
}

// The ffmpeg arguments that add the voice of the narration to the video: each sentence starts at its beat.
function soundArgs(voice) {
  if (!voice.length) return ['-c:v', 'copy'];
  const inputs = voice.flatMap((n) => ['-i', path.join(path.dirname(scenePath), n.voice)]);
  const delays = voice.map((n, k) => `[${k + 1}:a]adelay=${Math.round(n.start * 1000)}:all=1[a${k}]`).join(';');
  return [...inputs, '-filter_complex', `${delays};${voice.map((n, k) => `[a${k}]`).join('')}amix=inputs=${voice.length}:normalize=0[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k'];
}

// ---- the chat agent: the claude CLI with only the Toybox MCP server
let sessionId = crypto.randomUUID(), sessionStarted = false;
const mcpConfig = path.join(outDir, 'mcp.json');
fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { toybox: { command: process.execPath, args: [path.join(root, 'core/mcp.mjs'), '--scene', scenePath, '--render-url', `${origin}/api/render?token=${token}`] } } }));
function chat(text, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const ev = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  const sys = ['--append-system-prompt', 'You build animated 3D explainer scenes with the toybox tools. Read the guide "overview" first. Reply in plain text, short sentences, no markdown.'];
  const a = ['-p', text, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--mcp-config', mcpConfig,
    '--allowedTools', 'mcp__toybox', '--permission-mode', 'default', ...sys, ...(sessionStarted ? ['--resume', sessionId] : ['--session-id', sessionId])];
  const child = spawn('claude', a, { stdio: ['ignore', 'pipe', 'pipe'] });
  pids.add(child.pid); sessionStarted = true;
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(line);
        if (m.type === 'assistant') for (const c of m.message.content) { if (c.type === 'text' && c.text.trim()) ev({ text: c.text }); else if (c.type === 'tool_use') ev({ tool: c.name.replace('mcp__toybox__', '') }); }
      } catch {}
    }
  });
  child.stderr.on('data', (d) => ev({ log: String(d).slice(0, 300) }));
  child.on('exit', (code) => { pids.delete(child.pid); ev({ done: true, code }); res.end(); });
  res.on('close', () => { try { process.kill(child.pid); } catch {} });
}

const server = http.createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, { error: 'Bad host.' });
  const u = new URL(req.url, origin); const p = decodeURIComponent(u.pathname);
  if (p.startsWith('/api/') || p.startsWith('/export/') || p === '/result') {
    if (!authed(req, u)) return send(res, 403, { error: 'Bad token or origin.' });
    if (p === '/api/scene' && req.method === 'GET') { res.setHeader('content-type', 'application/json'); return res.end(fs.readFileSync(scenePath)); }
    if (p === '/api/voice') {   // a voice file of the narration: voice/<id>.wav next to the scene
      const f = u.searchParams.get('f') || '';
      if (!/^voice\/[0-9a-f]{12}\.wav$/.test(f)) return send(res, 400, { error: 'bad voice file' });
      return fs.readFile(path.join(path.dirname(scenePath), f), (e, d) => { if (e) return send(res, 404, { error: 'no' }); res.setHeader('content-type', 'audio/wav'); res.end(d); });
    }
    if (p === '/api/version') return send(res, 200, { v: fs.statSync(scenePath).mtimeMs });
    if (p === '/api/scene' && req.method === 'POST') {
      if (fs.statSync(scenePath).mtimeMs !== +u.searchParams.get('v')) return send(res, 409, { error: 'The agent changed the scene before your edit was saved. The page shows the new scene. Make the edit again.' });
      try { const s = JSON.parse(await body(req)); if (s.toybox !== 1 || !Array.isArray(s.objects)) throw new Error('not a scene'); fs.writeFileSync(scenePath, JSON.stringify(s, null, 2)); return send(res, 200, { ok: true, v: fs.statSync(scenePath).mtimeMs }); }
      catch (e) { return send(res, 400, { error: 'The scene is not valid: ' + e.message }); }
    }
    if (p === '/api/chat' && req.method === 'POST') { const { text } = JSON.parse(await body(req)); return chat(String(text || ''), res); }
    if (p === '/api/render' && req.method === 'POST') {
      const { t = 0, w = 1280, h = 720 } = JSON.parse(await body(req));
      const png = path.join(outDir, `preview-${Date.now()}.png`);
      const r = await oneJob('frame', `mode=frame&t=${+t}&w=${w}&h=${h}&png=${encodeURIComponent(png)}`, 60000);
      return r.error ? send(res, 500, r) : send(res, 200, { path: png });
    }
    if (p === '/api/export' && req.method === 'POST') {
      const o = JSON.parse(await body(req));
      const name = String(o.name || 'scene').replace(/[^\w-]+/g, '-');
      const sc = JSON.parse(fs.readFileSync(scenePath));
      const r = await oneJob('export', `mode=export&name=${name}&w=${o.width || 1920}&h=${o.height || 1080}&fps=${o.fps || 30}`, Math.max(120000, (sc.duration || 60) * 6000));
      return r.error ? send(res, 500, r) : send(res, 200, r);
    }
    // job page callbacks
    if (p === '/export/start') {
      const q = u.searchParams; job.cfg = { name: q.get('name'), fps: +q.get('fps') };
      job.base = path.join(outDir, job.cfg.name);
      fs.writeFileSync(job.base + '.srt', await body(req));
      job.h264 = fs.createWriteStream(job.base + '.h264'); job.chain = Promise.resolve();
      return send(res, 200, { ok: true });
    }
    if (p === '/export/chunk') { const b = await body(req); job.chain = job.chain.then(() => new Promise((ok) => job.h264.write(b, ok))); await job.chain; return send(res, 200, { ok: true }); }
    if (p === '/export/end') {
      await job.chain; await new Promise((ok) => job.h264.end(ok));
      const sc = JSON.parse(fs.readFileSync(scenePath)), voice = (sc.narration || []).filter((n) => /^voice\/[0-9a-f]{12}\.wav$/.test(n.voice || ''));
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-r', String(job.cfg.fps), '-f', 'h264', '-i', job.base + '.h264', ...soundArgs(voice), '-movflags', '+faststart', job.base + '.mp4']);
      fs.rmSync(job.base + '.h264', { force: true });
      if (r.error || r.status !== 0) {
        const e = { error: 'ffmpeg could not make the MP4: ' + (r.error ? r.error.message : String(r.stderr).slice(0, 300)) };
        const done = job.resolve; send(res, 500, e); if (done) done(e); return;
      }
      fs.copyFileSync(scenePath, job.base + '.toybox.json');
      for (const n of voice) { fs.mkdirSync(path.join(outDir, 'voice'), { recursive: true }); fs.copyFileSync(path.join(path.dirname(scenePath), n.voice), path.join(outDir, n.voice)); }
      const odbl = writeSceneOdbl(JSON.parse(fs.readFileSync(scenePath)), outDir);
      const info = Object.fromEntries(u.searchParams); delete info.token;
      Object.assign(info, { mp4: job.base + '.mp4', srt: job.base + '.srt', scene: job.base + '.toybox.json' }, odbl ? { odbl } : {});
      const done = job.resolve; send(res, 200, info); if (done) done(info); return;
    }
    if (p === '/api/frame-result') {
      const png = u.searchParams.get('png');
      if (!png || path.dirname(png) !== outDir) return send(res, 400, { error: 'bad path' });
      fs.writeFileSync(png, await body(req)); send(res, 200, { ok: true }); if (job && job.resolve) job.resolve({ path: png }); return;
    }
    if (p === '/api/job-error') { const m = String(await body(req)); send(res, 200, { ok: true }); if (job && job.resolve) job.resolve({ error: m.slice(0, 500) }); return; }
    return send(res, 404, { error: 'No such call.' });
  }
  const [base, rel] = p.startsWith('/engine/') ? [engineDir, p.slice(8)] : p.startsWith('/assets/') ? [path.join(root, 'assets'), p.slice(8)] : [path.join(root, 'web'), p === '/' ? 'app.html' : p.slice(1)];
  const f = path.resolve(base, rel), inside = path.relative(base, f);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return send(res, 403, { error: 'no' });
  fs.readFile(f, (e, d) => { if (e) return send(res, 404, { error: 'no' }); res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); res.end(d); });
});
server.listen(port, '127.0.0.1', () => {
  fs.writeFileSync(path.join(outDir, 'daemon.pid'), String(process.pid));
  console.log(`Toybox is ready: ${origin}/?token=${token}`);
  console.log(`Scene: ${scenePath}`);
});
const bye = () => { for (const pid of pids) { try { process.kill(pid); } catch {} } process.exit(0); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);
