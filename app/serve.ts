// The Toybox daemon. It serves the page, holds the scene file, runs the chat agent through the
// MCP server, and renders pictures and videos with a headless browser.
// Run: node app/serve.ts --scene PATH --engine BUILD_DIR [--port 8820]
// It listens on 127.0.0.1 only. Every /api and /export call needs the token that it prints.
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeSceneOdbl } from '../core/osm.ts';
import { FORMAT, parseScene, upgradeScene } from '../web/format.js';
import { encoderConfig } from '../web/export.js';
import type { Scene } from '../web/types.js';
import { isRecord, messageOf } from '../web/dom.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const args: Record<string, string | undefined> = {};
argv.forEach((x, i) => { if (x.startsWith('--')) args[x.slice(2)] = argv[i + 1]; });
const scenePath = path.resolve(args.scene || 'scene.toybox.json');
const engineDir = path.resolve(args.engine || path.join(root, 'engine-build'));
const port = +(args.port || 8820);
const outDir = path.resolve(args.out || path.join(path.dirname(scenePath), 'out'));
const chrome = process.env.TOYBOX_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const token = crypto.randomBytes(16).toString('hex');
fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(scenePath)) fs.writeFileSync(scenePath, JSON.stringify({ toybox: FORMAT, title: 'Untitled', duration: 30, backdrop: { ground: 'grass', size: [80, 80] }, objects: [], tracks: [], camera: [{ t: 0, eye: [0, 8, 16], target: [0, 1, 0], fov: 50 }], captions: [], callouts: [], chapters: [], credits: [] }, null, 2));

const types: Record<string, string> = { '.wav': 'audio/wav', '.html': 'text/html', '.js': 'text/javascript', '.ts': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.ttf': 'font/ttf', '.png': 'image/png', '.mp4': 'video/mp4', '.txt': 'text/plain' };
const webTranspiler = new Bun.Transpiler({ loader: 'ts' });
const origin = `http://127.0.0.1:${port}`;
const pids = new Set<number>();      // the PIDs of the child processes that this daemon started
const profiles = new Set<string>();  // the Chrome profile folders of the jobs in flight
const previews = new Set<string>();  // preview PNGs, removed when the daemon exits
const send = (res: ServerResponse, code: number, obj: unknown): void => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
const body = (req: IncomingMessage): Promise<Buffer> => new Promise((ok, fail) => { const c: Buffer[] = []; req.on('data', (d: Buffer) => c.push(d)); req.on('error', fail); req.on('end', () => ok(Buffer.concat(c))); });
const authed = (req: IncomingMessage, u: URL): boolean => (req.headers['x-toybox-token'] || u.searchParams.get('token')) === token
  && (!req.headers.origin || req.headers.origin === origin);

// ---- jobs in a headless browser. A job page posts its result back to this daemon.
// The answer of a job: an error text, or the data of the result.
interface JobResult { error?: string; [key: string]: unknown }
interface Job {
  kind: 'export' | 'frame';
  resolve?: (r: JobResult) => void;
  base?: string; scene?: Scene; h264?: fs.WriteStream; chain?: Promise<void>;
  writeError?: string | null; keepArtifacts?: boolean; cfg?: { name: string; fps: number };
}
let job: Job | null = null;
let previewSeq = 0;

function removeProfile(dir: string): void {
  profiles.delete(dir);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a helper still holds a file */ } }, 500); }
}
// Remove the files of a failed job. A good export with the same name keeps its .mp4.
function cleanupJobFiles(j: Job | null): void {
  if (!j || !j.base || j.keepArtifacts) return;
  for (const ext of ['.h264', '.srt', '.toybox.json']) { try { fs.rmSync(j.base + ext, { force: true }); } catch { /* already gone */ } }
}
function runBrowser(query: string, timeoutMs: number, mine: Job): Promise<JobResult> {
  const profile = fs.mkdtempSync(path.join(outDir, '.profile-'));
  profiles.add(profile);
  const child = spawn(chrome, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-swiftshader', '--window-size=1920,1080', '--hide-scrollbars',
    `${origin}/headless.html?token=${token}&${query}`], { stdio: 'ignore' });
  if (child.pid) pids.add(child.pid);
  return new Promise((resolve) => {
    let done = false, timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (child.pid) { try { process.kill(child.pid); } catch {} pids.delete(child.pid); }
      setTimeout(() => removeProfile(profile), 500);
    };
    const finish = (v: JobResult): void => { if (done) return; done = true; if (timer) clearTimeout(timer); stop(); resolve(v); };
    mine.resolve = finish;
    timer = setTimeout(() => finish({ error: 'The browser job took too long.' }), timeoutMs);
    child.on('error', (e) => {
      const why = Reflect.get(e, 'code') === 'ENOENT'
        ? `The daemon cannot start Chrome at "${chrome}". Install Google Chrome, or set the environment variable TOYBOX_CHROME to the path of Chrome.`
        : `Chrome could not start: ${e.message || e}`;
      finish({ error: why });
    });
    child.on('exit', () => setTimeout(() => { if (!done && job === mine) finish({ error: 'The browser stopped before the job ended.' }); }, 300));
  });
}
async function oneJob(kind: 'export' | 'frame', query: string, timeoutMs: number): Promise<JobResult> {
  if (job) return { error: 'Another render or export is running. Wait for it to end.' };
  const mine: Job = { kind };
  job = mine;
  try {
    const r = await runBrowser(query, timeoutMs, mine);
    if (r && r.error) cleanupJobFiles(mine);
    return r;
  } finally { if (job === mine) job = null; }
}

// The ffmpeg arguments that add the voice of the narration to the video: each sentence starts at its beat.
// A narration beat that has a voice file next to the scene.
interface VoiceBeat { voice: string; start: number }
function soundArgs(voice: VoiceBeat[]): string[] {
  if (!voice.length) return ['-c:v', 'copy'];
  const inputs = voice.flatMap((n) => ['-i', path.join(path.dirname(scenePath), n.voice)]);
  const delays = voice.map((n, k) => `[${k + 1}:a]adelay=${Math.round(n.start * 1000)}:all=1[a${k}]`).join(';');
  return [...inputs, '-filter_complex', `${delays};${voice.map((_n, k) => `[a${k}]`).join('')}amix=inputs=${voice.length}:normalize=0[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k'];
}

// ---- the chat agent: the claude CLI with only the Toybox MCP server
let sessionId = crypto.randomUUID(), sessionStarted = false;
const mcpConfig = path.join(outDir, 'mcp.json');
fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { toybox: { command: process.execPath, args: [path.join(root, 'core/mcp.ts'), '--scene', scenePath, '--render-url', `${origin}/api/render?token=${token}`] } } }));
function chat(text: string, res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const ev = (o: unknown): boolean => res.write(`data: ${JSON.stringify(o)}\n\n`);
  const sys = ['--append-system-prompt', 'You build animated 3D explainer scenes with the toybox tools. Read the guide "overview" first. Reply in plain text, short sentences, no markdown.'];
  const a = ['-p', text, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--mcp-config', mcpConfig,
    '--allowedTools', 'mcp__toybox', '--permission-mode', 'default', ...sys, ...(sessionStarted ? ['--resume', sessionId] : ['--session-id', sessionId])];
  const child = spawn('claude', a, { stdio: ['ignore', 'pipe', 'pipe'] });
  const childPid = child.pid;
  if (childPid) pids.add(childPid);
  sessionStarted = true;
  let buf = '';
  child.stdout.on('data', (d: Buffer) => {
    buf += d; let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try {
        const m: unknown = JSON.parse(line);
        if (isRecord(m) && m.type === 'assistant' && isRecord(m.message) && Array.isArray(m.message.content)) {
          for (const c of m.message.content) {
            if (!isRecord(c)) continue;
            if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) ev({ text: c.text });
            else if (c.type === 'tool_use' && typeof c.name === 'string') ev({ tool: c.name.replace('mcp__toybox__', '') });
          }
        }
      } catch {}
    }
  });
  child.stderr.on('data', (d: Buffer) => ev({ log: String(d).slice(0, 300) }));
  child.on('exit', (code) => { if (childPid) pids.delete(childPid); ev({ done: true, code }); res.end(); });
  res.on('close', () => { try { if (childPid) process.kill(childPid); } catch {} });
}

// The JSON object in the body of a request. Anything else is an error, as before.
async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const x: unknown = JSON.parse((await body(req)).toString('utf8'));
  if (!isRecord(x)) throw new TypeError('The request body is not a JSON object.');
  return x;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, { error: 'Bad host.' });
  const u = new URL(req.url || '/', origin); const p = decodeURIComponent(u.pathname);
  if (p.startsWith('/api/') || p.startsWith('/export/') || p === '/result') {
    if (!authed(req, u)) return send(res, 403, { error: 'Bad token or origin.' });
    if (p === '/api/scene' && req.method === 'GET') { res.setHeader('content-type', 'application/json'); res.end(fs.readFileSync(scenePath)); return; }
    if (p === '/api/voice') {   // a voice file of the narration: voice/<id>.wav next to the scene
      const f = u.searchParams.get('f') || '';
      if (!/^voice\/[0-9a-f]{12}\.wav$/.test(f)) return send(res, 400, { error: 'bad voice file' });
      return fs.readFile(path.join(path.dirname(scenePath), f), (e, d) => { if (e) return send(res, 404, { error: 'no' }); res.setHeader('content-type', 'audio/wav'); res.end(d); });
    }
    if (p === '/api/version') return send(res, 200, { v: fs.statSync(scenePath).mtimeMs });
    if (p === '/api/scene' && req.method === 'POST') {
      if (fs.statSync(scenePath).mtimeMs !== Number(u.searchParams.get('v'))) return send(res, 409, { error: 'The agent changed the scene before your edit was saved. The page shows the new scene. Make the edit again.' });
      try { const s = upgradeScene(JSON.parse((await body(req)).toString('utf8'))); if (!Array.isArray(s.objects)) throw new Error('not a scene'); fs.writeFileSync(scenePath, JSON.stringify(s, null, 2)); return send(res, 200, { ok: true, v: fs.statSync(scenePath).mtimeMs }); }
      catch (e) { return send(res, 400, { error: 'The scene is not valid: ' + messageOf(e) }); }
    }
    if (p === '/api/chat' && req.method === 'POST') { const { text } = await jsonBody(req); return chat(String(text || ''), res); }
    if (p === '/api/render' && req.method === 'POST') {
      const { t = 0, w = 1280, h = 720 } = await jsonBody(req);
      const png = path.join(outDir, `preview-${Date.now()}-${++previewSeq}.png`);
      const r = await oneJob('frame', `mode=frame&t=${Number(t)}&w=${w}&h=${h}&png=${encodeURIComponent(png)}`, 60000);
      if (r.error) return send(res, 500, r);
      previews.add(png);
      return send(res, 200, { path: png });
    }
    if (p === '/api/export' && req.method === 'POST') {
      const o = await jsonBody(req);
      const width = Number(o.width || 1920), height = Number(o.height || 1080), fps = Number(o.fps || 30);
      try { encoderConfig(width, height, fps); }   // refuse a size the browser cannot encode here, not in the browser
      catch (e) { return send(res, 400, { error: messageOf(e) }); }
      const name = (String(o.name || 'scene').replace(/[^\w-]+/g, '-').slice(0, 80) || 'scene');
      const sc: unknown = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
      const dur = Number(isRecord(sc) && sc.duration || 60);
      const r = await oneJob('export', `mode=export&name=${encodeURIComponent(name)}&w=${width}&h=${height}&fps=${fps}${o.hashes ? '&hashes=1' : ''}`, Math.max(120000, dur * 6000));
      return r.error ? send(res, 500, r) : send(res, 200, r);
    }
    // job page callbacks
    if (p === '/export/start') {
      if (!job || job.kind !== 'export') return send(res, 409, { error: 'No export job is running.' });
      const j = job;
      let payload: unknown;
      try { payload = JSON.parse((await body(req)).toString('utf8')); }
      catch { return send(res, 400, { error: 'The export start data is not JSON.' }); }
      if (!isRecord(payload) || !isRecord(payload.scene)) return send(res, 400, { error: 'The export start data has no scene.' });
      let startScene: Scene;
      try { startScene = parseScene(payload.scene); }
      catch (e) { return send(res, 400, { error: 'The export start data has no valid scene. ' + messageOf(e) }); }
      const name = (String(u.searchParams.get('name') || 'scene').replace(/[^\w-]+/g, '-').slice(0, 80) || 'scene');
      j.cfg = { name, fps: Number(u.searchParams.get('fps') || 30) };
      if (!(j.cfg.fps > 0)) j.cfg.fps = 30;
      j.base = path.join(outDir, name);
      j.scene = startScene;          // the exact scene that the page renders and encodes
      j.chain = Promise.resolve();
      j.writeError = null;
      fs.writeFileSync(j.base + '.srt', String(payload.srt || ''));
      fs.writeFileSync(j.base + '.toybox.json', JSON.stringify(startScene, null, 2));
      const stream = fs.createWriteStream(j.base + '.h264');
      j.h264 = stream;
      stream.on('error', (e) => { j.writeError = messageOf(e); });
      return send(res, 200, { ok: true });
    }
    if (p === '/export/chunk') {
      if (!job || job.kind !== 'export') return send(res, 409, { error: 'No export job is running.' });
      const j = job;
      if (j.writeError) return send(res, 500, { error: 'The video data could not be written: ' + j.writeError });
      const b = await body(req);
      const out = j.h264;
      if (!out) throw new Error('The export has not started.');
      j.chain = (j.chain ?? Promise.resolve()).then(() => new Promise<void>((ok, fail) => out.write(b, (e) => (e ? fail(e) : ok()))));
      try { await j.chain; }
      catch (e) { j.writeError = messageOf(e); j.chain = Promise.resolve(); return send(res, 500, { error: 'The video data could not be written: ' + j.writeError }); }
      return send(res, 200, { ok: true });
    }
    if (p === '/export/end') {
      if (!job || job.kind !== 'export') return send(res, 409, { error: 'No export job is running.' });
      const j = job;
      // Every terminal answer must resolve the job, or /api/export waits for the timeout.
      const finishError = (code: number, text: string, keep: boolean): void => {
        j.keepArtifacts = !!keep;
        const done = j.resolve;
        send(res, code, { error: text });
        if (done) done({ error: text });
      };
      const h264 = j.h264, jscene = j.scene, cfg = j.cfg, jbase = j.base;
      if (!j.chain || !h264 || !jscene || !cfg || !jbase) throw new Error('The export has not started.');
      await j.chain.catch(() => {});
      await new Promise<void>((ok) => { h264.on('close', () => ok()); h264.on('error', () => ok()); h264.end(); });
      if (j.writeError) return finishError(500, 'The video data could not be written: ' + j.writeError, false);
      const voice: VoiceBeat[] = [];
      for (const n of jscene.narration || []) if (n.voice && /^voice\/[0-9a-f]{12}\.wav$/.test(n.voice)) voice.push({ voice: n.voice, start: n.start ?? 0 });
      const fps = cfg.fps;
      const frames = Number(u.searchParams.get('frames') || 0);
      const seconds = frames > 0 ? frames / fps : 0;
      const ffArgs = ['-y', '-loglevel', 'error', '-r', String(fps), '-f', 'h264', '-i', jbase + '.h264', ...soundArgs(voice)];
      // The container must not run past the last rendered frame. -t caps the output at the frame
      // count. -shortest is not used: it would cut the video when a narration is shorter than it.
      if (seconds > 0) ffArgs.push('-t', seconds.toFixed(6));
      ffArgs.push('-movflags', '+faststart', jbase + '.mp4');
      const r = spawnSync('ffmpeg', ffArgs);
      if (r.error || r.status !== 0) {
        const missing = r.error && Reflect.get(r.error, 'code') === 'ENOENT';
        const text = missing
          ? 'ffmpeg is not installed or not on the PATH. Install ffmpeg to make an MP4. Toybox runs ffmpeg as a separate program and does not include it.'
          : 'ffmpeg could not make the MP4: ' + (r.error ? r.error.message : String(r.stderr).slice(0, 300));
        // Keep the frames: a second try (after the fix to the tool or the PATH) must not need a full export again.
        return finishError(500, text, true);
      }
      fs.rmSync(jbase + '.h264', { force: true });
      for (const n of voice) {   // keep the voice files next to the MP4, as before
        try { fs.mkdirSync(path.join(outDir, 'voice'), { recursive: true }); fs.copyFileSync(path.join(path.dirname(scenePath), n.voice), path.join(outDir, n.voice)); }
        catch { /* the MP4 keeps the sound; the copy is for reuse */ }
      }
      let odbl: unknown = null;
      try { odbl = writeSceneOdbl(jscene, outDir); } catch { /* the MP4 keeps the credits; the ODbL copy is for reuse */ }
      const info = Object.fromEntries(u.searchParams); delete info.token;
      Object.assign(info, { mp4: jbase + '.mp4', srt: jbase + '.srt', scene: jbase + '.toybox.json' }, odbl ? { odbl } : {});
      const done = j.resolve;
      send(res, 200, info);
      if (done) done(info);
      return;
    }
    if (p === '/api/frame-result') {
      if (!job || job.kind !== 'frame') return send(res, 409, { error: 'No picture job is running.' });
      const png = u.searchParams.get('png');
      if (!png || path.dirname(png) !== outDir) return send(res, 400, { error: 'bad path' });
      fs.writeFileSync(png, await body(req));
      previews.add(png);
      const done = job.resolve;
      send(res, 200, { ok: true });
      if (done) done({ path: png });
      return;
    }
    if (p === '/api/job-error') {
      const m = String(await body(req));
      const done = job && job.resolve;
      send(res, 200, { ok: true });
      if (done) done({ error: m.slice(0, 500) });
      return;
    }
    return send(res, 404, { error: 'No such call.' });
  }
  const [base, rel]: [string, string] = p.startsWith('/engine/') ? [engineDir, p.slice(8)] : p.startsWith('/assets/') ? [path.join(root, 'assets'), p.slice(8)] : [path.join(root, 'web'), p === '/' ? 'app.html' : p.slice(1)];
  const f = path.resolve(base, rel), inside = path.relative(base, f);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return send(res, 403, { error: 'no' });
  const tsSource = f.endsWith('.js') ? f.slice(0, -3) + '.ts' : '';
  if (tsSource && base === path.join(root, 'web') && fs.existsSync(tsSource)) {
    res.setHeader('content-type', types['.js'] ?? 'text/javascript');
    res.end(webTranspiler.transformSync(fs.readFileSync(tsSource, 'utf8')));
    return;
  }
  fs.readFile(f, (e, d) => { if (e) return send(res, 404, { error: 'no' }); res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); res.end(d); });
}

const server = http.createServer((req, res) => { handle(req, res).catch((e: unknown) => { try { send(res, 500, { error: 'The daemon failed: ' + messageOf(e) }); } catch { /* the answer is already sent */ } }); });
server.on('error', (e: Error) => { console.error('Toybox cannot listen:', e.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => {
  fs.writeFileSync(path.join(outDir, 'daemon.pid'), String(process.pid));
  console.log(`Toybox is ready: ${origin}/?token=${token}`);
  console.log(`Scene: ${scenePath}`);
});
// A short sleep that works in a signal handler. The browser child needs a moment to die before
// Windows and macOS let the daemon remove its profile folder.
const pause = (ms: number): void => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* no SharedArrayBuffer */ } };
const forceRemove = (dir: string): void => {
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a helper still holds a file */ }
    if (!fs.existsSync(dir)) { profiles.delete(dir); return; }
    pause(100);
  }
  profiles.delete(dir);
};
const bye = () => {
  for (const pid of pids) { try { process.kill(pid); } catch {} }
  if (job) cleanupJobFiles(job);   // a partial export must not leave a half MP4 side by side with a good one
  pause(150);
  for (const dir of [...profiles]) forceRemove(dir);
  for (const f of [...previews]) { try { fs.rmSync(f, { force: true }); } catch { /* already gone */ } }
  process.exit(0);
};
process.on('SIGINT', bye); process.on('SIGTERM', bye);
