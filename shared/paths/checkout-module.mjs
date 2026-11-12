import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGED_MODULE = /\.mjs$/u;

export function checkoutModulePath(file) {
  const source = file.replace(PACKAGED_MODULE, '.mts');
  return source !== file && existsSync(source) ? source : file;
}

export function checkoutModuleUrl(url) {
  return pathToFileURL(checkoutModulePath(fileURLToPath(url)));
}
