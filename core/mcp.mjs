// Stdio MCP server (JSON-RPC 2.0, one JSON message per line).
// Run: node core/mcp.mjs --scene PATH [--render-url URL]
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { toolSpecs } from './commands.mjs';
import { callTool } from './session.mjs';

export const PROTOCOL = '2025-06-18';

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--scene') o.scene = argv[++i];
    else if (argv[i] === '--render-url') o.renderUrl = argv[++i];
  }
  return o;
}

async function toolCall(opts, name, args) {
  const text = (obj, isError) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], isError: !!isError });
  const res = callTool(opts.scene, name, args || {});
  if (!res.ok) return text({ errors: res.errors }, true);
  if (name === 'render_preview') {
    if (!opts.renderUrl) return text({ errors: [{ code: 'no_viewer', message: 'No viewer is running, so render_preview cannot draw a picture. Start the Toybox viewer and the daemon.' }] }, true);
    try {
      const r = await fetch(opts.renderUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: args.t }) });
      const body = await r.json();
      if (!r.ok) return text({ errors: [{ code: 'render_failed', message: body.error || `Daemon answered ${r.status}.` }] }, true);
      return text(body.path ? { path: body.path, t: args.t } : body);
    } catch (e) {
      return text({ errors: [{ code: 'render_failed', message: `Cannot reach the render daemon at ${opts.renderUrl}: ${e.message}` }] }, true);
    }
  }
  return text(res.result);
}

export async function handle(opts, msg) {
  const { id, method, params } = msg;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (id === undefined) return null; // notification
  switch (method) {
    case 'initialize':
      return reply({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'toybox', version: '0.1.0' },
        instructions: 'Build animated 3D explainer scenes. Call guide("overview") first.' });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: toolSpecs });
    case 'tools/call': {
      if (!params?.name || !toolSpecs.some((t) => t.name === params.name)) return err(-32602, `Unknown tool: ${params?.name}`);
      try { return reply(await toolCall(opts, params.name, params.arguments)); } catch (e) { return reply({ content: [{ type: 'text', text: JSON.stringify({ errors: [{ code: 'internal', message: String(e.message || e) }] }) }], isError: true }); }
    }
    default: return err(-32601, `Method not found: ${method}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.scene) { process.stderr.write('Usage: node core/mcp.mjs --scene PATH [--render-url URL]\n'); process.exit(2); }
  let chain = Promise.resolve();
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    chain = chain.then(async () => {
      let msg;
      try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
      const out = await handle(opts, msg);
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    });
  });
  rl.on('close', () => { chain.then(() => process.exit(0)); });
}
