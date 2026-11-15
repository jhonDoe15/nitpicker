import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import { fieldOf, textOf } from '../../shared/values/readers.mts';

export function packageVersion(packageRoot: string = PACKAGE_ROOT): string {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  return textOf(fieldOf(manifest, 'version'));
}
