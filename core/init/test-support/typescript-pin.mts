import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

function peerRanges(file: string): unknown {
  const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return fieldOf(manifest, 'peerDependencies');
}

function upperBound(): string {
  const tools: unknown = createRequire(import.meta.url)('typescript-eslint/package.json');
  const range = textOf(fieldOf(fieldOf(tools, 'peerDependencies'), 'typescript'));
  const found = /<\s*\d[\w.-]*/u.exec(range);
  if (found === null) {
    throw new TypeError(`typescript-eslint has no upper typescript bound in ${range}`);
  }
  return found[0].replace(/\s+/gu, '');
}

export function typescriptPin(): string {
  const own = textOf(fieldOf(peerRanges(path.join(PACKAGE_ROOT, 'package.json')), 'typescript'));
  return `typescript@${own} ${upperBound()}`;
}

export function quotedTypescriptPin(): string {
  return `'${typescriptPin()}'`;
}

export function javascriptApiPin(): string {
  return `typescript@^6 ${upperBound()}`;
}
