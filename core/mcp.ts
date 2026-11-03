// Stdio MCP server (JSON-RPC 2.0, one JSON message per line).
// Run: bun core/mcp.ts --scene PATH [--render-url URL]
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { toolSpecs } from './commands.ts';
import { callTool } from './session.ts';
import { isRecord, messageOf } from '../web/dom.js';
import { VERSION } from './version.ts';

export const PROTOCOL = '2025-06-18';

export interface McpOpts { scene?: string; renderUrl?: string }
export type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export interface ToolReply { content: Content[]; isError?: boolean }
export interface RpcMessage { id?: string | number | null; method?: string; params?: { name?: string; arguments?: unknown } }
export interface RpcResponse { jsonrpc: '2.0'; id: string | number | null | undefined; result?: unknown; error?: { code: number; message: string } }

// The parts of a JSON-RPC message that handle reads. Anything that is not an object is not a message.
export function toRpcMessage(x: unknown): RpcMessage | null {
  if (!isRecord(x)) return null;
  const { id, method, params } = x;
  const msg: RpcMessage = {};
  if (id === null || typeof id === 'string' || typeof id === 'number') msg.id = id;
  if (typeof method === 'string') msg.method = method;
  if (isRecord(params)) msg.params = { ...(typeof params.name === 'string' ? { name: params.name } : {}), arguments: params.arguments };
  return msg;
}

export function parseArgs(argv: string[]): McpOpts {
  const o: McpOpts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--scene') o.scene = argv[++i];
    else if (argv[i] === '--render-url') o.renderUrl = argv[++i];
  }
  return o;
}

async function toolCall(opts: McpOpts, name: string, args: unknown): Promise<ToolReply> {
  const text = (obj: unknown, isError?: boolean): ToolReply => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], isError: !!isError });
  const scenePath = opts.scene ?? '';
  const res = await callTool(scenePath, name, args || {}, { exportDir: dirname(resolve(scenePath)) });
  if (!res.ok) return text({ errors: res.errors }, true);
  if (name === 'render_preview') {
    const t = isRecord(args) ? args.t : undefined;
    if (!opts.renderUrl) return text({ errors: [{ code: 'no_viewer', message: 'No viewer is running, so render_preview cannot draw a picture. Start the Toybox viewer and the daemon.' }] }, true);
    try {
      const r = await fetch(opts.renderUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t }) });
      const body: unknown = await r.json();
      const b = isRecord(body) ? body : {}, bodyPath = typeof b.path === 'string' && b.path ? b.path : null;
      if (!r.ok) return text({ errors: [{ code: 'render_failed', message: b.error || `Daemon answered ${r.status}.` }] }, true);
      const out = bodyPath ? { path: bodyPath, t } : body;
      // The agent has only the toybox tools, so it cannot open a path. Give it the pixels as an
      // MCP image block too; the text block keeps the t and the path for clients without images.
      const content: Content[] = [{ type: 'text', text: JSON.stringify(out) }];
      try {
        const png = bodyPath ? readFileSync(bodyPath) : null;
        if (png && png.length) content.push({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' });
      } catch { /* a missing picture is not an MCP error: the client still gets the path */ }
      return { content };
    } catch (e) {
      return text({ errors: [{ code: 'render_failed', message: `Cannot reach the render daemon at ${opts.renderUrl}: ${messageOf(e)}` }] }, true);
    }
  }
  return text(res.result);
}

export async function handle(opts: McpOpts, msg: RpcMessage): Promise<RpcResponse | null> {
  const { id, method, params } = msg;
  const reply = (result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result });
  const err = (code: number, message: string): RpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (id === undefined) return null; // notification
  switch (method) {
    case 'initialize':
      return reply({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'toybox', version: VERSION },
        instructions: 'Build animated 3D explainer scenes. Call guide("overview") first.' });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: toolSpecs });
    case 'tools/call': {
      if (!params?.name || !toolSpecs.some((t) => t.name === params.name)) return err(-32602, `Unknown tool: ${params?.name}`);
      try { return reply(await toolCall(opts, params.name, params.arguments)); } catch (e) { return reply({ content: [{ type: 'text', text: JSON.stringify({ errors: [{ code: 'internal', message: messageOf(e) }] }) }], isError: true }); }
    }
    default: return err(-32601, `Method not found: ${method}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.scene) { process.stderr.write('Usage: bun core/mcp.ts --scene PATH [--render-url URL]\n'); process.exit(2); }
  let chain = Promise.resolve();
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    chain = chain.then(async () => {
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
      const msg = toRpcMessage(parsed);
      if (!msg) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }) + '\n'); return; }
      const out = await handle(opts, msg);
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    });
  });
  rl.on('close', () => { chain.then(() => process.exit(0)); });
}
