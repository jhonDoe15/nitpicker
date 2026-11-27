import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(require.resolve("pkg/plugin.mjs"));