import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';

export function packageVersion(packageRoot = PACKAGE_ROOT) {
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  return manifest.version;
}
