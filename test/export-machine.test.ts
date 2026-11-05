// The export job machine (app/export.sm.md) and the daemon agree: the machine has the states of
// ExportState, and the daemon does each row. A stand-in "Chrome" holds the job open.
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { TestContext } from 'node:test';
import { EXPORT_PHASES } from '../app/export-job.ts';
import { view } from './helpers.ts';

interface Row { state: string; event: string; next: string }
interface Machine { initial: string; final: string[]; rows: Row[] }

// The machine file is the owned contract of the export job: read its table as rows.
function readMachine(): Machine {
  const text = readFileSync(new URL('../app/export.sm.md', import.meta.url), 'utf8');
  const part = text.split(/^## Machine export$/m)[1] ?? '';
  const initial = /^initial: *(\S+)/m.exec(part)?.[1] ?? '';
  const final = (/^final: *(.*)$/m.exec(part)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const rows = part.split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => {
    const [state = '', event = '', , next = ''] = l.split('|').slice(1).map((c) => c.trim());
    return { state, event, next };
  });
  return { initial, final, rows };
}

function tests1(): void {
test('the export machine has the states of ExportState', () => {
  const m = readMachine();
  const states = new Set(m.rows.flatMap((r) => [r.state, r.next]).filter((s) => s !== '*' && s !== '-' && !m.final.includes(s)));
  assert.deepEqual([...states].sort(), [...EXPORT_PHASES].sort());
  assert.ok(EXPORT_PHASES.some((p) => p === m.initial), m.initial);
});
}
tests1();

function tests2(): void {
test('the daemon does each row of the export machine', async (tc: TestContext) => {
  const dir = mkdtempSync(join(tmpdir(), 'tbsm-')), scene = join(dir, 's.toybox.json');
  const chrome = join(dir, 'chrome.sh');
  writeFileSync(chrome, '#!/bin/sh\nexec sleep 60\n');
  chmodSync(chrome, 0o755);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../app/serve.ts', import.meta.url)), '--scene', scene, '--port', String(port)], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, TOYBOX_CHROME: chrome } });
  tc.after(() => child.kill());
  const token = await new Promise<string>((ok, no) => {
    let out = ''; child.stdout.on('data', (d: Buffer) => { out += d.toString(); const m = /token=(\w+)/.exec(out); if (m?.[1]) ok(m[1]); });
    child.on('exit', () => { no(new Error('daemon stopped')); });
  });
  const base = `http://127.0.0.1:${port}`;
  const post = (p: string, body?: string): Promise<Response> => fetch(`${base}${p}${p.includes('?') ? '&' : '?'}token=${token}`, { method: 'POST', ...(body === undefined ? {} : { body }) });
  const sceneText = readFileSync(scene, 'utf8');
  const chunk = (): Promise<Response> => post('/export/chunk', 'x');
  const start = (): Promise<Response> => post('/export/start?name=sm&fps=30', JSON.stringify({ scene: JSON.parse(sceneText), srt: '' }));
  const finish = (): Promise<Response> => post('/api/job-error', 'stop');
  const events = new Map([['start', start], ['chunk', chunk], ['end', () => post('/export/end?frames=1')], ['finish', finish]]);
  // The phase of the daemon, read through a chunk (a chunk changes no phase).
  const phase = async (): Promise<string> => {
    const r = await chunk();
    if (r.ok) return 'streaming';
    const error = view<{ error?: string }>(await r.json()).error;
    return error === 'The export has not started.' ? 'waiting' : 'done';
  };
  const m = readMachine();
  for (const row of m.rows) {
    for (const state of row.state === '*' ? EXPORT_PHASES : [row.state]) {
      const exported = post('/api/export', '{}');
      while ((await phase()) === 'done') await new Promise((r) => setTimeout(r, 20));
      if (state === 'streaming') assert.equal((await start()).status, 200);
      const act = events.get(row.event);
      if (!act) throw new Error(`no driver for the event ${row.event}`);
      const r = await act();
      const at = `${state} | ${row.event}`;
      if (row.next === '-') assert.equal(r.status, 409, at);
      else assert.notEqual(r.status, 409, at);
      const next = row.next === '-' ? state : row.next;
      if (next === 'done') await exported;
      assert.equal(await phase(), next, at);
      if (next !== 'done') { await finish(); await exported; }
    }
  }
  const exported = post('/api/export', '{}');
  while ((await phase()) === 'done') await new Promise((r) => setTimeout(r, 20));
  const startBody = JSON.stringify({ scene: JSON.parse(sceneText), srt: '' });
  const slowBody = new ReadableStream<Uint8Array>({ async start(c) { await new Promise((r) => setTimeout(r, 300)); c.enqueue(new TextEncoder().encode(startBody)); c.close(); } });
  const slow = fetch(`${base}/export/start?name=sm&fps=30&token=${token}`, { method: 'POST', body: slowBody });
  await new Promise((r) => setTimeout(r, 100));
  const both = await Promise.all([slow, start()]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409], 'two start data at the same time: one stream only');
  await finish(); await exported;
});
}
tests2();
