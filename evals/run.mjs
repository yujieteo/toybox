// Runs both eval cases. Exits with 1 when a quality bar fails.
import { build as riot } from './riot.mjs';
import { build as home } from './hometeamns.mjs';
import { printReport } from './lib.mjs';

let failed = 0;
for (const build of [riot, home]) {
  const rep = build();
  printReport(rep);
  if (!rep.ok) failed++;
}
console.log(failed ? `\n${failed} eval case(s) failed.` : '\nAll eval cases passed.');
process.exit(failed ? 1 : 0);
