import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(`${process.cwd()}/plugin.mjs`);