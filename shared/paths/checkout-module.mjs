import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGED_MODULE = /\.mjs$/u;
const STRIPS_TYPES = typeof process.features.typescript === 'string';

export function checkoutModulePath(file, { stripsTypes = STRIPS_TYPES } = {}) {
  const source = file.replace(PACKAGED_MODULE, '.mts');
  return stripsTypes && source !== file && existsSync(source) ? source : file;
}

export function checkoutModuleUrl(url, options = {}) {
  return pathToFileURL(checkoutModulePath(fileURLToPath(url), options));
}
