import path from 'node:path';
import { pathToFileURL } from 'node:url';
async function load(configPath: string) { return import(pathToFileURL(configPath).href); }