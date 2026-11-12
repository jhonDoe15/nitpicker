import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGED_MODULE = /\.mjs$/u;
const STRIPS_TYPES = typeof process.features.typescript === 'string';

export function checkoutModulePath(file, { stripsTypes = STRIPS_TYPES } = {}) {
  const source = file.replace(PACKAGED_MODULE, '.mts');
  if (source === file || !existsSync(source)) {
    return file;
  }
  return stripsTypes || !existsSync(file) ? source : file;
}

export function checkoutModuleUrl(url, options = {}) {
  return pathToFileURL(checkoutModulePath(fileURLToPath(url), options));
}
