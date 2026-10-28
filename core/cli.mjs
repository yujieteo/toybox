// Command line for the same tools. Run: node core/cli.mjs <tool> '<json args>' --scene PATH
// Also: guide NAME, validate, tools.
import { fileURLToPath } from 'node:url';
import { toolSpecs } from './commands.mjs';
import { callTool } from './session.mjs';

const argv = process.argv.slice(2);
let scene = null; const rest = [];
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--scene') scene = argv[++i]; else rest.push(argv[i]); }
const [tool, ...more] = rest;
if (!tool || tool === 'help' || tool === '--help') {
  console.log('Usage: node core/cli.mjs <tool> \'<json args>\' --scene PATH\nTools: ' + toolSpecs.map((t) => t.name).join(', '));
  process.exit(tool ? 0 : 2);
}
if (tool === 'tools') { console.log(JSON.stringify(toolSpecs, null, 1)); process.exit(0); }
let args = {};
if (tool === 'guide') args = { name: more[0] };
else if (more[0]) { try { args = JSON.parse(more[0]); } catch (e) { console.error(`Bad JSON args: ${e.message}`); process.exit(2); } }
if (!scene) scene = process.env.TOYBOX_SCENE;
if (!scene) { console.error('Give --scene PATH (or set TOYBOX_SCENE).'); process.exit(2); }
const res = callTool(scene, tool, args);
if (!res.ok) { console.error(JSON.stringify({ errors: res.errors }, null, 1)); process.exit(1); }
if (tool === 'guide') console.log(res.result.text); else console.log(JSON.stringify(res.result, null, 1));
if (tool === 'validate' && !res.result.valid) process.exit(1);
