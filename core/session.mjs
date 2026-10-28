// Shared by the MCP server and the command line: load the scene file, run a tool, save when ok.
import { existsSync } from 'node:fs';
import { loadScene, saveScene, newScene } from './scene.mjs';
import { runTool, READ_ONLY } from './commands.mjs';
import { fetchOverpass, bboxQuery, validBbox } from './osm.mjs';

export async function callTool(scenePath, name, args, ctx = {}) {
  if (name === 'import_osm' && validBbox(args.bbox)) {
    try { ctx = { ...ctx, overpass: await fetchOverpass(bboxQuery(args.bbox)), odblPath: scenePath.replace(/(\.toybox)?\.json$/, '') + '.osm.json' }; }
    catch (e) { return { ok: false, errors: [{ code: 'osm_fetch_failed', message: `The Overpass server did not answer: ${e.message}. Try again later.` }] }; }
  }
  const scene = existsSync(scenePath) ? loadScene(scenePath) : newScene({});
  const res = runTool(scene, name, args, ctx);
  if (res.ok && (!READ_ONLY.has(name) || !existsSync(scenePath)) && name !== 'guide') saveScene(scenePath, scene);
  return res;
}
