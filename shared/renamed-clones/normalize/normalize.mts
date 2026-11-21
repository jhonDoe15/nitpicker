import path from 'node:path';
import type TypeScript from 'typescript';
import { normalizeScanned } from './scanned.mts';
import { normalizeTypescript } from './typescript.mts';

export function normalizeSource({
  text,
  fileName,
  syntax,
  typescript,
}: {
  readonly text: string;
  readonly fileName: string;
  readonly syntax: string;
  readonly typescript?: typeof TypeScript | undefined;
}): string {
  switch (syntax) {
    case 'typescript':
      if (typescript === undefined) {
        throw new TypeError('Normalizing typescript needs the typescript api');
      }
      return normalizeTypescript(text, path.basename(fileName), typescript);
    case 'python':
    case 'kotlin':
    case 'java':
    case 'go':
      return normalizeScanned(text, syntax);
    default:
      throw new TypeError(`Unknown syntax ${syntax}`);
  }
}
