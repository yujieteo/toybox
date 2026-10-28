import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScene } from '../core/scene.mjs';

const MCP = new URL('../core/mcp.mjs', import.meta.url).pathname;
const CLI = new URL('../core/cli.mjs', import.meta.url).pathname;

function start(args) {
  const p = spawn(process.execPath, [MCP, ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = createInterface({ input: p.stdout });
  const waiting = new Map();
  rl.on('line', (l) => { const m = JSON.parse(l); waiting.get(m.id)?.(m); });
  let id = 0;
  return {
    call: (method, params) => new Promise((res) => { const i = ++id; waiting.set(i, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); }),
    notify: (method) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'),
    tool: async function (name, args) { const r = await this.call('tools/call', { name, arguments: args }); return { ...r.result, data: JSON.parse(r.result.content[0].text) }; },
    stop: () => { p.stdin.end(); return new Promise((r) => p.on('exit', r)); },
  };
}

test('MCP server over stdio: handshake, tools, saving, errors', async () => {
  const scene = join(mkdtempSync(join(tmpdir(), 'tbmcp-')), 's.toybox.json');
  const c = start(['--scene', scene]);
  const init = await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.ok(init.result.capabilities.tools);
  c.notify('notifications/initialized');
  assert.deepEqual((await c.call('ping')).result, {});
  const list = await c.call('tools/list');
  assert.ok(list.result.tools.length >= 26);
  assert.ok(list.result.tools.every((t) => t.name && t.description && t.inputSchema));

  let r = await c.tool('place', { model: 'car-sedan', at: [0, 0], id: 'c1' });
  assert.ok(!r.isError); assert.equal(r.data.id, 'c1');
  assert.equal(loadScene(scene).objects.length, 1, 'scene file saved');
  r = await c.tool('place', { model: 'car-sedan', at: [0.3, 0] });
  assert.equal(r.isError, true); assert.equal(r.data.errors[0].code, 'overlap');
  assert.equal(loadScene(scene).objects.length, 1, 'failed call does not save');
  r = await c.tool('render_preview', { t: 1 });
  assert.equal(r.isError, true); assert.match(r.data.errors[0].message, /No viewer/);
  r = await c.tool('guide', { name: 'overview' });
  assert.match(r.data.text, /TOYBOX OVERVIEW/);
  const bad = await c.call('tools/call', { name: 'nope', arguments: {} });
  assert.ok(bad.error);
  assert.ok((await c.call('nothing/here')).error);
  await c.stop();
});

test('render_preview posts t to the render url and returns the image path', async () => {
  let got = null;
  const srv = createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { got = JSON.parse(b); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ path: '/tmp/frame-3.png' })); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const scene = join(mkdtempSync(join(tmpdir(), 'tbmcp-')), 's.toybox.json');
  const c = start(['--scene', scene, '--render-url', `http://127.0.0.1:${srv.address().port}/render`]);
  await c.call('initialize', {});
  const r = await c.tool('render_preview', { t: 3 });
  assert.ok(!r.isError); assert.equal(r.data.path, '/tmp/frame-3.png'); assert.deepEqual(got, { t: 3 });
  await c.stop(); srv.close();
});

test('CLI runs a tool, a guide and validate', () => {
  const scene = join(mkdtempSync(join(tmpdir(), 'tbcli-')), 's.toybox.json');
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a, '--scene', scene], { encoding: 'utf8' });
  let r = run('place', '{"model":"tree","at":[0,0],"id":"t1"}'); assert.equal(r.status, 0, r.stderr); assert.ok(existsSync(scene));
  r = run('place', '{"model":"tree","at":[0,0]}'); assert.equal(r.status, 1); assert.match(r.stderr, /overlap/);
  r = run('validate'); assert.equal(r.status, 0);
  r = run('guide', 'camera'); assert.match(r.stdout, /CAMERA/);
  r = run('guide', 'zzz'); assert.equal(r.status, 1);
});
