// Command line for the same tools. Run: bun core/cli.ts <tool> '<json args>' --scene PATH
// Also: guide NAME, validate, tools.
import { toolSpecs } from './commands.ts';
import { callTool } from './session.ts';
import { messageOf } from '../web/dom.js';

const argv = process.argv.slice(2);
let scene: string | null | undefined = null; const rest: string[] = [];
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--scene') scene = argv[++i]; else rest.push(argv[i] ?? ''); }
const [tool, ...more] = rest;
if (!tool || tool === 'help' || tool === '--help') {
  console.log('Usage: bun core/cli.ts <tool> \'<json args>\' --scene PATH\nTools: ' + toolSpecs.map((t) => t.name).join(', '));
  process.exit(tool ? 0 : 2);
}
if (tool === 'tools') { console.log(JSON.stringify(toolSpecs, null, 1)); process.exit(0); }
let args: unknown = {};
if (tool === 'guide') args = { name: more[0] };
else if (more[0]) { try { args = JSON.parse(more[0]); } catch (e) { console.error(`Bad JSON args: ${messageOf(e)}`); process.exit(2); } }
if (!scene) scene = process.env.TOYBOX_SCENE;
if (!scene) { console.error('Give --scene PATH (or set TOYBOX_SCENE).'); process.exit(2); }
const res = await callTool(scene, tool, args);
if (!res.ok) { console.error(JSON.stringify({ errors: res.errors }, null, 1)); process.exit(1); }
const result = res.result, field = (k: string): unknown => (typeof result === 'object' && result !== null && k in result ? Object.getOwnPropertyDescriptor(result, k)?.value : undefined);
if (tool === 'guide') console.log(field('text')); else console.log(JSON.stringify(result, null, 1));
if (tool === 'validate' && !field('valid')) process.exit(1);
