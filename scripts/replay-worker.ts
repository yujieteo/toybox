import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isRecord } from '../web/dom.js';

type RunTool = (scene: unknown, name: string, args: unknown, ctx: unknown) => unknown;

const [treeArg, inputsArg, outputsArg] = process.argv.slice(2);
if (!treeArg || !inputsArg || !outputsArg) throw new Error('Usage: bun scripts/replay-worker.ts TREE_ROOT INPUTS_DIR OUTPUTS_DIR');
const tree = resolve(treeArg);

async function loadRunTool(): Promise<RunTool> {
  for (const ext of ['ts', 'mjs']) {
    const file = join(tree, 'core', `commands.${ext}`);
    if (!existsSync(file)) continue;
    const mod: unknown = await import(pathToFileURL(file).href);
    if (isRecord(mod)) {
      const fn = mod['runTool'];
      if (typeof fn === 'function') return (scene, name, args, ctx) => fn(scene, name, args, ctx);
    }
  }
  throw new Error(`No core/commands.ts or core/commands.mjs with runTool in ${tree}`);
}

const MAX_COPY_BYTES = 50 * 1024 * 1024;
function sandboxDir(original: unknown, scratch: string, label: string): string {
  const copy = join(scratch, label);
  mkdirSync(copy, { recursive: true });
  if (typeof original === 'string' && existsSync(original) && statSync(original).isDirectory()) {
    const size = readdirSync(original, { recursive: true, withFileTypes: true }).reduce((sum, e) => sum + (e.isFile() ? statSync(join(e.parentPath, e.name)).size : 0), 0);
    if (size <= MAX_COPY_BYTES) cpSync(original, copy, { recursive: true });
  }
  return copy;
}

const runTool = await loadRunTool();
mkdirSync(outputsArg, { recursive: true });
for (const file of readdirSync(inputsArg).filter((f) => f.endsWith('.json')).sort()) {
  const call: unknown = JSON.parse(readFileSync(join(inputsArg, file), 'utf8'));
  if (!isRecord(call) || typeof call['name'] !== 'string') throw new Error(`${file}: not a captured call`);
  const scratch = mkdtempSync(join(tmpdir(), 'toybox-replay-'));
  const ctx: Record<string, unknown> = isRecord(call['ctx']) ? { ...call['ctx'] } : {};
  for (const key of ['sceneDir', 'exportDir']) if (key in ctx) ctx[key] = sandboxDir(ctx[key], scratch, key);
  if (typeof ctx['odblPath'] === 'string') ctx['odblPath'] = join(sandboxDir(undefined, scratch, 'odbl'), 'scene.osm.json');
  const args = isRecord(call['args']) ? { ...call['args'] } : call['args'];
  if (isRecord(args) && typeof args['path'] === 'string' && isAbsolute(args['path'])) args['path'] = join(sandboxDir(undefined, scratch, 'path'), basename(args['path']));
  const scene = call['scene'];
  let outcome: unknown;
  try {
    const result: unknown = runTool(scene, call['name'], args, ctx);
    outcome = JSON.parse(JSON.stringify({ result: result ?? null, scene: scene ?? null }));
  } catch (e) {
    outcome = { threw: e instanceof Error ? e.message.replaceAll(scratch, '<tmp>') : String(e) };
  }
  writeFileSync(join(outputsArg, file), JSON.stringify(outcome, null, 1).replaceAll(scratch, '<tmp>'));
}
