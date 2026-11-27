import path from 'node:path';
import { pathToFileURL } from 'node:url';
const file = pathToFileURL(path.join(root, 'x.mjs')).href; const mod = await import(file);