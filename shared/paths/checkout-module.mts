import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGED_MODULE = /\.mjs$/u;
const STRIPS_TYPES = typeof process.features.typescript === 'string';

export type CheckoutModuleOptions = { readonly stripsTypes: boolean };

export function checkoutModulePath(
  file: string,
  { stripsTypes }: CheckoutModuleOptions = { stripsTypes: STRIPS_TYPES },
): string {
  const source = file.replace(PACKAGED_MODULE, '.mts');
  if (source === file || !existsSync(source)) {
    return file;
  }
  return stripsTypes || !existsSync(file) ? source : file;
}

export function checkoutModuleUrl(
  url: URL | string,
  options: CheckoutModuleOptions = { stripsTypes: STRIPS_TYPES },
): URL {
  return pathToFileURL(checkoutModulePath(fileURLToPath(url), options));
}
