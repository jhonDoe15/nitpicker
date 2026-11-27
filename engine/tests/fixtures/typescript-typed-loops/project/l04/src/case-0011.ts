import { readFile } from 'node:fs/promises'; for (const id of ids) { await readFile(id); }
export {};
