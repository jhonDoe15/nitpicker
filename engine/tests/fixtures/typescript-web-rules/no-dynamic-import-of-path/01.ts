import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = await import(pathToFileURL(path.resolve(root, configFile)).href);