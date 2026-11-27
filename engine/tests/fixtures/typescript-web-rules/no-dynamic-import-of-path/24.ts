import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(fileURLToPath(new URL("./x.mjs", import.meta.url)));