import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(new URL('./x.mjs', import.meta.url).href);