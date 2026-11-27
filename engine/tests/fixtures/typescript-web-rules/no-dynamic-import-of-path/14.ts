import path from 'node:path';
import { pathToFileURL } from 'node:url';
const a = pathToFileURL(x); async function load(configPath: string) { return import(configPath); }