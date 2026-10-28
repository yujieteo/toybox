// Lets `node --test test/` work: Node 24 resolves a directory to this file. It loads every *.test.mjs file.
const { readdirSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
for (const f of readdirSync(__dirname).sort()) if (f.endsWith('.test.mjs')) import(pathToFileURL(join(__dirname, f)).href);
