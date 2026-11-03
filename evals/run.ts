// Runs the eval cases. Exits with 1 when a quality bar fails.
import { build as riot } from './riot.ts';
import { build as home } from './hometeamns.ts';
import { build as narrated } from './narrated.ts';
import { build as mrt } from './mrt.ts';
import { printReport } from './lib.ts';

let failed = 0;
for (const build of [riot, home, narrated, mrt]) {
  const rep = build();
  printReport(rep);
  if (!rep.ok) failed++;
}
console.log(failed ? `\n${failed} eval case(s) failed.` : '\nAll eval cases passed.');
process.exit(failed ? 1 : 0);
