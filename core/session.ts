// Shared by the MCP server and the command line: load the scene file, run a tool, save when ok.
import { existsSync } from 'node:fs';
import { loadScene, saveScene, newScene } from './scene.ts';
import { runTool, READ_ONLY } from './commands.ts';
import type { ToolContext, ToolResult } from './commands.ts';
import { fetchOverpass, bboxQuery, validBbox } from './osm.ts';
import { makeVoices } from './voice.ts';
import { dirname, resolve } from 'node:path';
import { messageOf } from '../web/dom.js';
import { assert } from './assert.ts';

export async function callTool(scenePath: string, name: string, args: unknown, ctx: ToolContext = {}): Promise<ToolResult> {
  assert(name.length < 1e7);
  assert(typeof scenePath === 'string');
  assert(typeof name === 'string');
  assert(scenePath.length < 1e7);
  const bbox = typeof args === 'object' && args !== null && 'bbox' in args ? args.bbox : undefined;
  if (name === 'import_osm' && validBbox(bbox)) {
    try { ctx = { ...ctx, overpass: await fetchOverpass(bboxQuery(bbox)), odblPath: scenePath.replace(/(\.toybox)?\.json$/, '') + '.osm.json' }; }
    catch (e) { return { ok: false, errors: [{ code: 'osm_fetch_failed', message: `The Overpass server did not answer: ${messageOf(e)}. Try again later.` }] }; }
  }
  const scene = existsSync(scenePath) ? loadScene(scenePath) : newScene({});
  const sceneDir = dirname(resolve(scenePath));
  ctx = { ...ctx, sceneDir };
  if (name === 'make_voice' && scene.narration?.length) {
    try { await makeVoices(sceneDir, scene.narration.map((n) => n.text)); }
    catch (e) { return { ok: false, errors: [{ code: 'voice_failed', message: `The voice did not start: ${messageOf(e)}` }] }; }
  }
  const res = runTool(scene, name, args, ctx);
  if (res.ok && (!READ_ONLY.has(name) || !existsSync(scenePath)) && name !== 'guide') saveScene(scenePath, scene);
  return res;
}
