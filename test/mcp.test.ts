import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createInterface } from 'node:readline';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScene } from '../core/scene.ts';
import { must, view } from './helpers.ts';

interface RpcReply { id: number; result?: unknown; error?: unknown }
interface Block { type: string; text?: string; mimeType?: string; data?: string }
interface ToolResult<T> { isError?: boolean; content: Block[]; data: T }
interface Info { protocolVersion: string; capabilities: { tools?: unknown } }
interface ToolDef { name: string; description: string; inputSchema: unknown }
interface Listing { tools: ToolDef[] }
interface Client {
  call: (method: string, params?: unknown) => Promise<RpcReply>;
  notify: (method: string) => void;
  tool: <T>(name: string, args: unknown) => Promise<ToolResult<T>>;
  stop: () => Promise<unknown>;
}
interface ErrData { errors: { code: string; message: string }[] }

const MCP = fileURLToPath(new URL('../core/mcp.ts', import.meta.url));
const CLI = fileURLToPath(new URL('../core/cli.ts', import.meta.url));

// The port of a server that listens.
function port(srv: Server): number {
  const a = srv.address();
  if (a === null || typeof a === 'string') throw new Error('the server does not listen on a port');
  return a.port;
}

function start(args: string[]): Client {
  const p = spawn(process.execPath, [MCP, ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = createInterface({ input: p.stdout });
  const waiting = new Map<number, (m: RpcReply) => void>();
  rl.on('line', (l: string) => { const m = view<RpcReply>(JSON.parse(l)); waiting.get(m.id)?.(m); });
  let id = 0;
  const call = (method: string, params?: unknown) => new Promise<RpcReply>((res) => { const i = ++id; waiting.set(i, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
  return {
    call,
    notify: (method: string) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'),
    tool: async <T>(name: string, args: unknown): Promise<ToolResult<T>> => {
      const r = await call('tools/call', { name, arguments: args });
      const result = view<{ isError?: boolean; content: Block[] }>(r.result);
      return { ...result, data: view<T>(JSON.parse(must(must(result.content[0]).text))) };
    },
    stop: () => { p.stdin.end(); return new Promise((r) => p.on('exit', r)); },
  };
}

function tests1(): void {
test('MCP server over stdio: handshake, tools, saving, errors', async () => {
  const scene = join(mkdtempSync(join(tmpdir(), 'tbmcp-')), 's.toybox.json');
  const c = start(['--scene', scene]);
  const init = await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  const info = view<Info>(init.result);
  assert.equal(info.protocolVersion, '2025-06-18');
  assert.ok(info.capabilities.tools);
  c.notify('notifications/initialized');
  assert.deepEqual((await c.call('ping')).result, {});
  const list = view<Listing>((await c.call('tools/list')).result);
  assert.ok(list.tools.length >= 26);
  assert.ok(list.tools.every((t) => t.name && t.description && t.inputSchema));

  const placed = await c.tool<{ id: string }>('place', { model: 'car-sedan', at: [0, 0], id: 'c1' });
  assert.ok(!placed.isError); assert.equal(placed.data.id, 'c1');
  assert.equal(loadScene(scene).objects.length, 1, 'scene file saved');
  const clash = await c.tool<ErrData>('place', { model: 'car-sedan', at: [0.3, 0] });
  assert.equal(clash.isError, true); assert.equal(must(clash.data.errors[0]).code, 'overlap');
  assert.equal(loadScene(scene).objects.length, 1, 'failed call does not save');
  const preview = await c.tool<ErrData>('render_preview', { t: 1 });
  assert.equal(preview.isError, true); assert.match(must(preview.data.errors[0]).message, /No viewer/);
  const guide = await c.tool<{ text: string }>('guide', { name: 'overview' });
  assert.match(guide.data.text, /TOYBOX OVERVIEW/);
  const bad = await c.call('tools/call', { name: 'nope', arguments: {} });
  assert.ok(bad.error);
  assert.ok((await c.call('nothing/here')).error);
  await c.stop();
});

test('render_preview posts t to the render url and returns the image path', async () => {
  let got: unknown = null;
  const srv = createServer((req, res) => { let b = ''; req.on('data', (d: Buffer) => (b += d)); req.on('end', () => { got = JSON.parse(b); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ path: '/tmp/frame-3.png' })); }); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const scene = join(mkdtempSync(join(tmpdir(), 'tbmcp-')), 's.toybox.json');
  const c = start(['--scene', scene, '--render-url', `http://127.0.0.1:${port(srv)}/render`]);
  await c.call('initialize', {});
  const r = await c.tool<{ path: string }>('render_preview', { t: 3 });
  assert.ok(!r.isError); assert.equal(r.data.path, '/tmp/frame-3.png'); assert.deepEqual(got, { t: 3 });
  assert.equal(r.content.length, 1, 'a picture that cannot be read gives the text block only');
  await c.stop(); srv.close();
});
}
tests1();

function tests2(): void {
test('render_preview gives the picture to the agent as an MCP image block', async () => {
  // A 1x1 PNG: the daemon writes the real frame; this only proves the bytes reach the client.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const dir = mkdtempSync(join(tmpdir(), 'tbmcp-')), pngPath = join(dir, 'preview-1.png');
  writeFileSync(pngPath, png);
  const srv = createServer((req, res) => { req.resume(); req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ path: pngPath })); }); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const c = start(['--scene', join(dir, 's.toybox.json'), '--render-url', `http://127.0.0.1:${port(srv)}/render`]);
  await c.call('initialize', {});
  const r = await c.tool<{ path: string }>('render_preview', { t: 3 });
  assert.ok(!r.isError);
  assert.equal(r.data.path, pngPath);
  assert.equal(r.content.length, 2, 'the text block and the picture');
  const image = must(r.content[1]);
  assert.equal(image.type, 'image');
  assert.equal(image.mimeType, 'image/png');
  assert.deepEqual(Buffer.from(must(image.data), 'base64'), png);
  await c.stop(); srv.close();
});

test('CLI runs a tool, a guide and validate', () => {
  const scene = join(mkdtempSync(join(tmpdir(), 'tbcli-')), 's.toybox.json');
  const run = (...a: string[]) => spawnSync(process.execPath, [CLI, ...a, '--scene', scene], { encoding: 'utf8' });
  let r = run('place', '{"model":"tree","at":[0,0],"id":"t1"}'); assert.equal(r.status, 0, r.stderr); assert.ok(existsSync(scene));
  r = run('place', '{"model":"tree","at":[0,0]}'); assert.equal(r.status, 1); assert.match(r.stderr, /overlap/);
  r = run('validate'); assert.equal(r.status, 0);
  r = run('guide', 'camera'); assert.match(r.stdout, /CAMERA/);
  r = run('guide', 'zzz'); assert.equal(r.status, 1);
});
}
tests2();
