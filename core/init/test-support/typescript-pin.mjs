import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';

function peerRanges(file) {
  return JSON.parse(readFileSync(file, 'utf8')).peerDependencies;
}

export function typescriptPin() {
  const own = peerRanges(path.join(PACKAGE_ROOT, 'package.json')).typescript;
  const tools = createRequire(import.meta.url)('typescript-eslint/package.json');
  const upper = /<\s*\d[\w.-]*/u.exec(tools.peerDependencies.typescript)[0].replace(/\s+/gu, '');
  return `typescript@${own} ${upper}`;
}

export function quotedTypescriptPin() {
  return `'${typescriptPin()}'`;
}

export function javascriptApiPin() {
  const tools = createRequire(import.meta.url)('typescript-eslint/package.json');
  const upper = /<\s*\d[\w.-]*/u.exec(tools.peerDependencies.typescript)[0].replace(/\s+/gu, '');
  return `typescript@^6 ${upper}`;
}
