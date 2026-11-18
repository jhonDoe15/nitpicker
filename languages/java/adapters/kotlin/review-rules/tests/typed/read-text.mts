import { readInside } from '../../../../../../../shared/conventions/read-inside.mjs';

export function readText(root: string, relative: string): string | undefined {
  const text: unknown = readInside(root, relative, 'utf8');
  return typeof text === 'string' ? text : undefined;
}
