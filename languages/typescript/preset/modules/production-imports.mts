import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lazyTypeScriptApi } from '../../typescript-api/lazy-typescript-api.mts';
import { depthFirst as untypedDepthFirst } from '../../../../shared/traversal.mjs';
import { fieldsOf } from '../../../../shared/values/readers.mts';

const depthFirst: (root: unknown, children: (node: unknown) => unknown[]) => Iterable<unknown> =
  untypedDepthFirst;

export function specifiersOf(file: string): string[] {
  return existsSync(file)
    ? lazyTypeScriptApi()
        .preProcessFile(readFileSync(file, 'utf8'), true, true)
        .importedFiles.map(({ fileName }) => fileName)
    : [];
}

function childValues(node: unknown): unknown[] {
  return node !== null && typeof node === 'object' ? Object.values(fieldsOf(node)) : [];
}

export function stringLeaves(value: unknown): string[] {
  return [...depthFirst(value, childValues)].filter((node) => typeof node === 'string');
}
