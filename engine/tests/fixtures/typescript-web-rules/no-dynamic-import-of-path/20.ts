import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(path.resolve(root, configFile));