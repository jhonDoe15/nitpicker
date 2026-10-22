import path from 'node:path';
import { normalizeScanned } from './scanned.mjs';
import { normalizeTypescript } from './typescript.mjs';

export function normalizeSource({ text, fileName, syntax, typescript }) {
  switch (syntax) {
    case 'typescript':
      return normalizeTypescript(text, path.basename(fileName), typescript);
    case 'python':
    case 'kotlin':
    case 'java':
      return normalizeScanned(text, syntax);
    default:
      throw new TypeError(`Unknown syntax ${String(syntax)}`);
  }
}
