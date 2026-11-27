import fs from 'node:fs';
const entryFile = findEntry(root); const mod = await import(entryFile);