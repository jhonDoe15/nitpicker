import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(`${import.meta.dirname}/plugin.js`);