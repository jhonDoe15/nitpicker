import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { ancestorDirectories } from '../../filesystem.mts';
import { fieldOf, parseJson, textOf, textsOf } from '../../values/readers.mts';
import type { TreeListing } from '../project-files-types.mts';
import { loadTree } from '../repository-listing.mts';
import { hasRepositoryMarker } from '../tree-walk.mts';

export const SEEDED_TREE_VARIABLE = 'NITPICKER_PROJECT_FILES_TREE';

type Seeded = { readonly top: string; readonly tree: TreeListing };

const source: { file: string | undefined; seeded: Seeded | undefined } = {
  file: undefined,
  seeded: undefined,
};

function recordOf(line: string): { kind: string; value: string } {
  const record = parseJson(line);
  return { kind: textOf(fieldOf(record, 'kind')), value: textOf(fieldOf(record, 'value')) };
}

function readSeed(file: string): Seeded {
  const records = readFileSync(file, 'utf8')
    .split(/\r\n|\r|\n/u)
    .filter((line) => line.length > 0)
    .map(recordOf);
  const valuesOf = (kind: string): string[] =>
    records.filter((record) => record.kind === kind).map((record) => record.value);
  return {
    top: valuesOf('top')[0] ?? '',
    tree: {
      files: valuesOf('file'),
      links: new Set(valuesOf('link')),
      submodules: new Set(valuesOf('submodule')),
      gitPaths: valuesOf('gitPath'),
    },
  };
}

export function seedTreesFrom(file: string | undefined): void {
  source.file = file;
  source.seeded = undefined;
}

export function seededTree(top: string): TreeListing | undefined {
  if (source.file === undefined) {
    return undefined;
  }
  source.seeded ??= readSeed(source.file);
  return source.seeded.top === top ? source.seeded.tree : undefined;
}

function writeRecords(handle: number, top: string, tree: TreeListing): void {
  const lists: [string, Iterable<string>][] = [
    ['top', [top]],
    ['file', tree.files],
    ['link', tree.links],
    ['submodule', tree.submodules],
    ['gitPath', tree.gitPaths],
  ];
  for (const [kind, values] of lists) {
    for (const value of values) {
      writeSync(handle, `${JSON.stringify({ kind, value })}\n`);
    }
  }
}

export function seedRepositoryTree(directory: string, file: string): Record<string, string> {
  const top = ancestorDirectories(directory).find(hasRepositoryMarker);
  const tree = top === undefined ? undefined : loadTree(top);
  if (top === undefined || tree === undefined) {
    return {};
  }
  const handle = openSync(file, 'w');
  try {
    writeRecords(handle, top, tree);
  } finally {
    closeSync(handle);
  }
  return { [SEEDED_TREE_VARIABLE]: file };
}
