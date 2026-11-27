import path from 'node:path';
import { pathToFileURL } from 'node:url';
const full = path.resolve(root, file); const mod = await import(full);