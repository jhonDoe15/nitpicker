import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(path.join(process.cwd(), "plugin.mjs"));