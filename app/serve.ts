// The Toybox daemon. It serves the page, holds the scene file, runs the chat agent through the
// MCP server, and renders pictures and videos with a headless browser.
// Run: bun app/serve.ts --scene PATH --engine BUILD_DIR [--port 8820]
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
import type { ExportState, Streaming } from './export-job.ts';
import { assert } from '../core/assert.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const args: Record<string, string | undefined> = {};
for (let i = 0; i < argv.length; i++) { const x = argv[i]; if (x?.startsWith('--')) args[x.slice(2)] = argv[i + 1]; }
const scenePath = path.resolve(args.scene || 'scene.toybox.json');
const engineDir = path.resolve(args.engine || path.join(root, 'engine-build'));
const port = +(args.port || 8820);
assert(Number.isInteger(port) && port >= 0 && port < 65536);
assert(scenePath.length > 0);
const outDir = path.resolve(args.out || path.join(path.dirname(scenePath), 'out'));
const chrome = process.env.TOYBOX_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const token = crypto.randomBytes(16).toString('hex');
fs.mkdirSync(outDir, { recursive: true });
ensureScene();

// The first run starts with an empty scene.
function ensureScene(): void {
  if (fs.existsSync(scenePath)) return;
  fs.writeFileSync(scenePath, JSON.stringify({ toybox: FORMAT, title: 'Untitled', duration: 30, backdrop: { ground: 'grass', size: [80, 80] }, objects: [], tracks: [], camera: [{ t: 0, eye: [0, 8, 16], target: [0, 1, 0], fov: 50 }], captions: [], callouts: [], chapters: [], credits: [] }, null, 2));
}
const types: Record<string, string> = { '.wav': 'audio/wav', '.html': 'text/html', '.js': 'text/javascript', '.ts': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.ttf': 'font/ttf', '.png': 'image/png', '.mp4': 'video/mp4', '.txt': 'text/plain' };
const webTranspiler = new Bun.Transpiler({ loader: 'ts' });
const origin = `http://127.0.0.1:${port}`;
const pids = new Set<number>();      // the PIDs of the child processes that this daemon started
const profiles = new Set<string>();  // the Chrome profile folders of the jobs in flight
const previews = new Set<string>();  // preview PNGs, removed when the daemon exits
const send = (res: ServerResponse, code: number, obj: unknown): void => { 
  assert(typeof res === 'object');
  assert(typeof code === 'number');
  assert(!Number.isNaN(code));
  res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
const body = (req: IncomingMessage): Promise<Buffer> => new Promise((ok, fail) => { 
  assert(typeof ok === 'function');
  assert(typeof fail === 'function');
  const c: Buffer[] = []; req.on('data', (d: Buffer) => c.push(d)); req.on('error', fail); req.on('end', () => ok(Buffer.concat(c))); });
const authed = (req: IncomingMessage, u: URL): boolean => (req.headers['x-toybox-token'] || u.searchParams.get('token')) === token
  && (!req.headers.origin || req.headers.origin === origin);

// ---- jobs in a headless browser. A job page posts its result back to this daemon.
// The answer of a job: an error text, or the data of the result.
interface JobResult { error?: string; [key: string]: unknown }
// A job is a picture job or an export job (app/export.sm.md).
type Job = { resolve?: (r: JobResult) => void } & ({ kind: 'frame' } | { kind: 'export'; state: ExportState });
let job: Job | null = null;
let previewSeq = 0;

// The code of a system error, such as ENOENT.
function errorCode(e: unknown): unknown { 
  return typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined; }
function removeProfile(dir: string): void {
  assert(typeof dir === 'string');
  assert(dir.length < 1e7);
  profiles.delete(dir);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a helper still holds a file */ } }, 500); }
}
// Remove the files of a failed job. A good export with the same name keeps its .mp4.
function cleanupJobFiles(j: Job | null): void {
  if (!j || j.kind !== 'export' || j.state.phase !== 'streaming' || j.state.keepArtifacts) return;
  for (const ext of ['.h264', '.srt', '.toybox.json']) { try { fs.rmSync(j.state.base + ext, { force: true }); } catch { /* already gone */ } }
}
function runBrowser(query: string, timeoutMs: number, mine: Job): Promise<JobResult> {
  assert(typeof outDir === 'string');
  assert(typeof profiles === 'object');
  assert(typeof chrome === 'string');
  assert(outDir.length < 1e7);
  assert(typeof query === 'string');
  assert(typeof timeoutMs === 'number');
  assert(query.length < 1e7);
  assert(!Number.isNaN(timeoutMs));
  const profile = fs.mkdtempSync(path.join(outDir, '.profile-'));
  profiles.add(profile);
  const child = spawn(chrome, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-swiftshader', '--window-size=1920,1080', '--hide-scrollbars',
    `${origin}/headless.html?token=${token}&${query}`], { stdio: 'ignore' });
  if (child.pid) pids.add(child.pid);
  return new Promise((resolve) => {
    assert(typeof resolve === 'function');
    let done = false, timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (child.pid) { try { process.kill(child.pid); } catch {} pids.delete(child.pid); }
      setTimeout(() => removeProfile(profile), 500);
    };
    const finish = (v: JobResult): void => { 
      assert(typeof v === 'object');
      if (done) return; done = true; if (timer) clearTimeout(timer); stop(); resolve(v); };
    mine.resolve = finish;
    timer = setTimeout(() => finish({ error: 'The browser job took too long.' }), timeoutMs);
    child.on('error', (e) => {
      assert(typeof e === 'object');
      const why = errorCode(e) === 'ENOENT'
        ? `The daemon cannot start Chrome at "${chrome}". Install Google Chrome, or set the environment variable TOYBOX_CHROME to the path of Chrome.`
        : `Chrome could not start: ${e.message || e}`;
      finish({ error: why });
    });
    child.on('exit', () => setTimeout(() => { if (!done && job === mine) finish({ error: 'The browser stopped before the job ended.' }); }, 300));
  });
}
async function oneJob(kind: 'export' | 'frame', query: string, timeoutMs: number): Promise<JobResult> {
  assert(typeof kind === 'string');
  assert(typeof query === 'string');
  assert(typeof timeoutMs === 'number');
  assert(kind.length < 1e7);
  assert(query.length < 1e7);
  assert(!Number.isNaN(timeoutMs));
  if (job) return { error: 'Another render or export is running. Wait for it to end.' };
  const mine: Job = kind === 'export' ? { kind, state: { phase: 'waiting' } } : { kind };
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
  assert(typeof voice === 'object');
  assert(voice.length < 1e7);
  if (!voice.length) return ['-c:v', 'copy'];
  const inputs = voice.flatMap((n) => {
    assert(typeof n === 'object');
    return ['-i', path.join(path.dirname(scenePath), n.voice)];
  });
  const delays = voice.map((n, k) => {
    assert(typeof n === 'object');
    assert(typeof k === 'number');
    assert(!Number.isNaN(k));
    const returned = `[${k + 1}:a]adelay=${Math.round(n.start * 1000)}:all=1[a${k}]`;
    assert(typeof returned === 'string');
    assert(returned.length < 1e7);
    return returned;
  }).join(';');
  return [...inputs, '-filter_complex', `${delays};${voice.map((_n, k) => {
    assert(typeof _n === 'object');
    assert(typeof k === 'number');
    assert(!Number.isNaN(k));
    const returned = `[a${k}]`;
    assert(typeof returned === 'string');
    assert(returned.length < 1e7);
    return returned;
  }).join('')}amix=inputs=${voice.length}:normalize=0[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k'];
}

// ---- the chat agent: the claude CLI with only the Toybox MCP server
let sessionId = crypto.randomUUID(), sessionStarted = false;
const mcpConfig = path.join(outDir, 'mcp.json');
fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { toybox: { command: process.execPath, args: [path.join(root, 'core/mcp.ts'), '--scene', scenePath, '--render-url', `${origin}/api/render?token=${token}`] } } }));
function chat(text: string, res: ServerResponse): void {
  assert(typeof text === 'string');
  assert(typeof res === 'object');
  assert(text.length < 1e7);
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const ev = (o: unknown): boolean => {
    return res.write(`data: ${JSON.stringify(o)}\n\n`);
  };
  const sys = ['--append-system-prompt', 'You build animated 3D explainer scenes with the toybox tools. Read the guide "overview" first. Reply in plain text, short sentences, no markdown.'];
  const a = ['-p', text, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--mcp-config', mcpConfig,
    '--allowedTools', 'mcp__toybox', '--permission-mode', 'default', ...sys, ...(sessionStarted ? ['--resume', sessionId] : ['--session-id', sessionId])];
  const child = spawn('claude', a, { stdio: ['ignore', 'pipe', 'pipe'] });
  const childPid = child.pid;
  if (childPid) pids.add(childPid);
  sessionStarted = true;
  let buf = '';
  child.stdout.on('data', (d: Buffer) => {
    assert(typeof d === 'object');
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
  child.stderr.on('data', (d: Buffer) => {
    assert(typeof d === 'object');
    return ev({ log: String(d).slice(0, 300) });
  });
  child.on('exit', (code) => { if (childPid) pids.delete(childPid); ev({ done: true, code }); res.end(); });
  res.on('close', () => { try { if (childPid) process.kill(childPid); } catch {} });
}

// The JSON object in the body of a request. Anything else is an error, as before.
async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  assert(typeof req === 'object');
  const x: unknown = JSON.parse((await body(req)).toString('utf8'));
  if (!isRecord(x)) throw new TypeError('The request body is not a JSON object.');
  return x;
}

type Route = (req: IncomingMessage, res: ServerResponse, u: URL) => Promise<void> | void;

// The scene file, as the page reads it.
function routeSceneGet(_req: IncomingMessage, res: ServerResponse): void {
  assert(typeof _req === 'object');
  assert(typeof res === 'object');
  res.setHeader('content-type', 'application/json');
  res.end(fs.readFileSync(scenePath));
}
// A voice file of the narration: voice/<id>.wav next to the scene.
function routeVoice(_req: IncomingMessage, res: ServerResponse, u: URL): void {
  assert(typeof _req === 'object');
  assert(typeof res === 'object');
  assert(typeof u === 'object');
  const f = u.searchParams.get('f') || '';
  if (!/^voice\/[0-9a-f]{12}\.wav$/.test(f)) return send(res, 400, { error: 'bad voice file' });
  fs.readFile(path.join(path.dirname(scenePath), f), (e, d) => { 
    assert(typeof d === 'object');
    if (e) return send(res, 404, { error: 'no' }); res.setHeader('content-type', 'audio/wav'); res.end(d); });
}
function routeVersion(_req: IncomingMessage, res: ServerResponse): void { 
  assert(typeof _req === 'object');
  assert(typeof res === 'object');
  send(res, 200, { v: fs.statSync(scenePath).mtimeMs }); }
async function routeScenePost(req: IncomingMessage, res: ServerResponse, u: URL): Promise<void> {
  assert(typeof req === 'object');
  assert(typeof res === 'object');
  assert(typeof u === 'object');
  if (fs.statSync(scenePath).mtimeMs !== Number(u.searchParams.get('v'))) return send(res, 409, { error: 'The agent changed the scene before your edit was saved. The page shows the new scene. Make the edit again.' });
  try { const s = upgradeScene(JSON.parse((await body(req)).toString('utf8'))); if (!Array.isArray(s.objects)) throw new Error('not a scene'); fs.writeFileSync(scenePath, JSON.stringify(s, null, 2)); return send(res, 200, { ok: true, v: fs.statSync(scenePath).mtimeMs }); }
  catch (e) { return send(res, 400, { error: 'The scene is not valid: ' + messageOf(e) }); }
}
async function routeChat(req: IncomingMessage, res: ServerResponse): Promise<void> { 
  assert(typeof req === 'object');
  assert(typeof res === 'object');
  const { text } = await jsonBody(req); return chat(String(text || ''), res); }
async function routeRender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  assert(typeof req === 'object');
  assert(typeof res === 'object');
  const { t = 0, w = 1280, h = 720 } = await jsonBody(req);
  const png = path.join(outDir, `preview-${Date.now()}-${++previewSeq}.png`);
  const r = await oneJob('frame', `mode=frame&t=${Number(t)}&w=${w}&h=${h}&png=${encodeURIComponent(png)}`, 60000);
  if (r.error) return send(res, 500, r);
  previews.add(png);
  return send(res, 200, { path: png });
}
async function routeExport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  assert(typeof req === 'object');
  assert(typeof res === 'object');
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

// ---- job page callbacks
async function routeExportStart(req: IncomingMessage, res: ServerResponse, u: URL): Promise<void> {
  assert(typeof req === 'object');
  assert(typeof res === 'object');
  assert(typeof u === 'object');
  if (!job || job.kind !== 'export') return send(res, 409, { error: 'No export job is running.' });
  const j = job;
  let payload: unknown;
  try { payload = JSON.parse((await body(req)).toString('utf8')); }
  catch { return send(res, 400, { error: 'The export start data is not JSON.' }); }
  if (j.state.phase !== 'waiting') return send(res, 409, { error: 'The export has already started.' });
  if (!isRecord(payload) || !isRecord(payload.scene)) return send(res, 400, { error: 'The export start data has no scene.' });
  let startScene: Scene;
  try { startScene = parseScene(payload.scene); }
  catch (e) { return send(res, 400, { error: 'The export start data has no valid scene. ' + messageOf(e) }); }
  const name = (String(u.searchParams.get('name') || 'scene').replace(/[^\w-]+/g, '-').slice(0, 80) || 'scene');
  const fps = Number(u.searchParams.get('fps') || 30);
  const base = path.join(outDir, name);
  // startScene is the exact scene that the page renders and encodes.
  const st: Streaming = { phase: 'streaming', base, scene: startScene, fps: fps > 0 ? fps : 30, h264: fs.createWriteStream(base + '.h264'), chain: Promise.resolve(), writeError: null, keepArtifacts: false };
  j.state = st;
  st.h264.on('error', (e) => { 
    assert(typeof e === 'object');
    st.writeError = messageOf(e); });
  fs.writeFileSync(base + '.srt', String(payload.srt || ''));
  fs.writeFileSync(base + '.toybox.json', JSON.stringify(startScene, null, 2));
  return send(res, 200, { ok: true });
}
async function routeExportChunk(req: IncomingMessage, res: ServerResponse): Promise<void> {
  assert(typeof req === 'object');
  assert(typeof res === 'object');
  if (!job || job.kind !== 'export') return send(res, 409, { error: 'No export job is running.' });
  const j = job.state;
  if (j.phase !== 'streaming') return send(res, 409, { error: 'The export has not started.' });
  if (j.writeError) return send(res, 500, { error: 'The video data could not be written: ' + j.writeError });
  const b = await body(req);
  const out = j.h264;
  j.chain = j.chain.then(() => new Promise<void>((ok, fail) => {
    assert(typeof ok === 'function');
    assert(typeof fail === 'function');
    return out.write(b, (e) => (e ? fail(e) : ok()));
  }));
  try { await j.chain; }
  catch (e) { j.writeError = messageOf(e); j.chain = Promise.resolve(); return send(res, 500, { error: 'The video data could not be written: ' + j.writeError }); }
  return send(res, 200, { ok: true });
}
// The narration beats that have a voice file.
function voiceBeats(scene: Scene): VoiceBeat[] {
  assert(typeof scene === 'object');
  const voice: VoiceBeat[] = [];
  for (const n of scene.narration || []) if (n.voice && /^voice\/[0-9a-f]{12}\.wav$/.test(n.voice)) voice.push({ voice: n.voice, start: n.start ?? 0 });
  return voice;
}
// Mux the h264 frames and the voice into an MP4. Returns the error text, or null when it worked.
function muxMp4(jbase: string, fps: number, frames: number, voice: VoiceBeat[]): string | null {
  assert(typeof jbase === 'string');
  assert(typeof fps === 'number');
  assert(typeof frames === 'number');
  assert(typeof voice === 'object');
  assert(jbase.length < 1e7);
  assert(!Number.isNaN(fps));
  assert(!Number.isNaN(frames));
  assert(voice.length < 1e7);
  const seconds = frames > 0 ? frames / fps : 0;
  const ffArgs = ['-y', '-loglevel', 'error', '-r', String(fps), '-f', 'h264', '-i', jbase + '.h264', ...soundArgs(voice)];
  // The container must not run past the last rendered frame. -t caps the output at the frame
  // count. -shortest is not used: it would cut the video when a narration is shorter than it.
  if (seconds > 0) ffArgs.push('-t', seconds.toFixed(6));
  ffArgs.push('-movflags', '+faststart', jbase + '.mp4');
  const r = spawnSync('ffmpeg', ffArgs);
  if (!r.error && r.status === 0) return null;
  const missing = r.error && errorCode(r.error) === 'ENOENT';
  const returned = missing
    ? 'ffmpeg is not installed or not on the PATH. Install ffmpeg to make an MP4. Toybox runs ffmpeg as a separate program and does not include it.'
    : 'ffmpeg could not make the MP4: ' + (r.error ? r.error.message : String(r.stderr).slice(0, 300));
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned;
}
// Copy the voice files next to the MP4 and write the ODbL copy. Both are for reuse, so a failure is not fatal.
function keepExtras(jscene: Scene, voice: VoiceBeat[]): unknown {
  assert(typeof jscene === 'object');
  assert(typeof voice === 'object');
  assert(voice.length < 1e7);
  for (const n of voice) {   // keep the voice files next to the MP4, as before
    try { fs.mkdirSync(path.join(outDir, 'voice'), { recursive: true }); fs.copyFileSync(path.join(path.dirname(scenePath), n.voice), path.join(outDir, n.voice)); }
    catch { /* the MP4 keeps the sound; the copy is for reuse */ }
  }
  let odbl: unknown = null;
  try { odbl = writeSceneOdbl(jscene, outDir); } catch { /* the MP4 keeps the credits; the ODbL copy is for reuse */ }
  return odbl;
}
async function routeExportEnd(_req: IncomingMessage, res: ServerResponse, u: URL): Promise<void> {
  assert(typeof _req === 'object');
  assert(typeof res === 'object');
  assert(typeof u === 'object');
  if (!job || job.kind !== 'export') return send(res, 409, { error: 'No export job is running.' });
  const mine = job, j = job.state;
  if (j.phase !== 'streaming') return send(res, 409, { error: 'The export has not started.' });
  // Every terminal answer must resolve the job, or /api/export waits for the timeout.
  const finishError = (code: number, text: string, keep: boolean): void => {
    assert(typeof code === 'number');
    assert(typeof text === 'string');
    assert(typeof keep === 'boolean');
    assert(!Number.isNaN(code));
    assert(text.length < 1e7);
    j.keepArtifacts = keep;
    const done = mine.resolve;
    send(res, code, { error: text });
    if (done) done({ error: text });
  };
  const { h264, scene: jscene, fps, base: jbase } = j;
  await j.chain.catch(() => {});
  await new Promise<void>((ok) => { 
    assert(typeof ok === 'function');
    h264.on('close', () => ok()); h264.on('error', () => ok()); h264.end(); });
  if (j.writeError) return finishError(500, 'The video data could not be written: ' + j.writeError, false);
  const voice = voiceBeats(jscene);
  const failure = muxMp4(jbase, fps, Number(u.searchParams.get('frames') || 0), voice);
  // Keep the frames: a second try (after the fix to the tool or the PATH) must not need a full export again.
  if (failure !== null) return finishError(500, failure, true);
  fs.rmSync(jbase + '.h264', { force: true });
  const odbl = keepExtras(jscene, voice);
  const info = Object.fromEntries(u.searchParams); delete info.token;
  Object.assign(info, { mp4: jbase + '.mp4', srt: jbase + '.srt', scene: jbase + '.toybox.json' }, odbl ? { odbl } : {});
  const done = mine.resolve;
  send(res, 200, info);
  if (done) done(info);
}
async function routeFrameResult(req: IncomingMessage, res: ServerResponse, u: URL): Promise<void> {
  assert(typeof req === 'object');
  assert(typeof res === 'object');
  assert(typeof u === 'object');
  if (!job || job.kind !== 'frame') return send(res, 409, { error: 'No picture job is running.' });
  const png = u.searchParams.get('png');
  if (!png || path.dirname(png) !== outDir) return send(res, 400, { error: 'bad path' });
  fs.writeFileSync(png, await body(req));
  previews.add(png);
  const done = job.resolve;
  send(res, 200, { ok: true });
  if (done) done({ path: png });
}
async function routeJobError(req: IncomingMessage, res: ServerResponse): Promise<void> {
  assert(typeof req === 'object');
  assert(typeof res === 'object');
  const m = String(await body(req));
  const done = job && job.resolve;
  send(res, 200, { ok: true });
  if (done) done({ error: m.slice(0, 500) });
}

// The calls that need the token. Some answer to any method, the others to one.
const anyMethodRoutes: Record<string, Route> = {
  '/api/voice': routeVoice, '/api/version': routeVersion, '/api/frame-result': routeFrameResult, '/api/job-error': routeJobError,
  '/export/start': routeExportStart, '/export/chunk': routeExportChunk, '/export/end': routeExportEnd,
};
const methodRoutes: Record<string, Route> = {
  'GET /api/scene': routeSceneGet, 'POST /api/scene': routeScenePost, 'POST /api/chat': routeChat, 'POST /api/render': routeRender, 'POST /api/export': routeExport,
};
async function handleApi(req: IncomingMessage, res: ServerResponse, u: URL, p: string): Promise<void> {
  assert(typeof req === 'object');
  assert(typeof res === 'object');
  assert(typeof u === 'object');
  assert(typeof p === 'string');
  assert(p.length < 1e7);
  if (!authed(req, u)) return send(res, 403, { error: 'Bad token or origin.' });
  const key = `${req.method} ${p}`;
  const route = Object.hasOwn(anyMethodRoutes, p) ? anyMethodRoutes[p] : Object.hasOwn(methodRoutes, key) ? methodRoutes[key] : undefined;
  if (route) return route(req, res, u);
  return send(res, 404, { error: 'No such call.' });
}
// A file of the web page, the engine or the assets.
function handleStatic(res: ServerResponse, p: string): void {
  assert(typeof res === 'object');
  assert(typeof p === 'string');
  assert(p.length < 1e7);
  const [base, rel]: [string, string] = p.startsWith('/engine/') ? [engineDir, p.slice(8)] : p.startsWith('/assets/') ? [path.join(root, 'assets'), p.slice(8)] : [path.join(root, 'web'), p === '/' ? 'app.html' : p.slice(1)];
  const f = path.resolve(base, rel), inside = path.relative(base, f);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return send(res, 403, { error: 'no' });
  const tsSource = f.endsWith('.js') ? f.slice(0, -3) + '.ts' : '';
  if (tsSource && base === path.join(root, 'web') && fs.existsSync(tsSource)) {
    res.setHeader('content-type', types['.js'] ?? 'text/javascript');
    res.end(webTranspiler.transformSync(fs.readFileSync(tsSource, 'utf8')));
    return;
  }
  fs.readFile(f, (e, d) => { 
    assert(typeof d === 'object');
    if (e) return send(res, 404, { error: 'no' }); res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); res.end(d); });
}
async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  assert(typeof req === 'object');
  assert(typeof res === 'object');
  if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, { error: 'Bad host.' });
  const u = new URL(req.url || '/', origin); const p = decodeURIComponent(u.pathname);
  if (p.startsWith('/api/') || p.startsWith('/export/') || p === '/result') return handleApi(req, res, u, p);
  return handleStatic(res, p);
}

const server = http.createServer((req, res) => { 
  assert(typeof req === 'object');
  handle(req, res).catch((e: unknown) => { 
  try { send(res, 500, { error: 'The daemon failed: ' + messageOf(e) }); } catch { /* the answer is already sent */ } }); });
server.on('error', (e: Error) => { 
  assert(typeof e === 'object');
  console.error('Toybox cannot listen:', e.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => {
  fs.writeFileSync(path.join(outDir, 'daemon.pid'), String(process.pid));
  console.log(`Toybox is ready: ${origin}/?token=${token}`);
  console.log(`Scene: ${scenePath}`);
});
// A short sleep that works in a signal handler. The browser child needs a moment to die before
// Windows and macOS let the daemon remove its profile folder.
function pause(ms: number): void { 
  assert(typeof ms === 'number');
  assert(!Number.isNaN(ms));
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* no SharedArrayBuffer */ } }
function forceRemove(dir: string): void {
  assert(typeof dir === 'string');
  assert(dir.length < 1e7);
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a helper still holds a file */ }
    if (!fs.existsSync(dir)) { profiles.delete(dir); return; }
    pause(100);
  }
  profiles.delete(dir);
}
function bye(): void {
  for (const pid of pids) { try { process.kill(pid); } catch {} }
  if (job) cleanupJobFiles(job);   // a partial export must not leave a half MP4 side by side with a good one
  pause(150);
  for (const dir of [...profiles]) forceRemove(dir);
  for (const f of [...previews]) { try { fs.rmSync(f, { force: true }); } catch { /* already gone */ } }
  process.exit(0);
}
process.on('SIGINT', bye); process.on('SIGTERM', bye);
