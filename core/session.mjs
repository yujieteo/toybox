// Shared by the MCP server and the command line: load the scene file, run a tool, save when ok.
import { existsSync } from 'node:fs';
import { loadScene, saveScene, newScene } from './scene.mjs';
import { runTool, READ_ONLY } from './commands.mjs';

export function callTool(scenePath, name, args, ctx = {}) {
  const scene = existsSync(scenePath) ? loadScene(scenePath) : newScene({});
  const res = runTool(scene, name, args, ctx);
  if (res.ok && (!READ_ONLY.has(name) || !existsSync(scenePath)) && name !== 'guide') saveScene(scenePath, scene);
  return res;
}
