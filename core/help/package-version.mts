import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import { fieldOf } from '../../shared/values/readers.mts';

export function packageVersion(packageRoot: string = PACKAGE_ROOT): unknown {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  return fieldOf(manifest, 'version');
}
