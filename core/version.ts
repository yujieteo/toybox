import { assert } from './assert.ts';
// The Toybox release version. scripts/release.sh tags this version. CHANGELOG.md lists the changes.
export const VERSION = '0.1.0';
assert(/^\d+\.\d+\.\d+$/.test(VERSION));
assert(VERSION.length < 20);
