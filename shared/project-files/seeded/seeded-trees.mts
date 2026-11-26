import { readFileSync, writeFileSync } from 'node:fs';
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

function readSeed(file: string): Seeded {
  const value = parseJson(readFileSync(file, 'utf8'));
  return {
    top: textOf(fieldOf(value, 'top')),
    tree: {
      files: textsOf(fieldOf(value, 'files')),
      links: new Set(textsOf(fieldOf(value, 'links'))),
      submodules: new Set(textsOf(fieldOf(value, 'submodules'))),
      gitPaths: textsOf(fieldOf(value, 'gitPaths')),
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

export function seedRepositoryTree(directory: string, file: string): Record<string, string> {
  const top = ancestorDirectories(directory).find(hasRepositoryMarker);
  const tree = top === undefined ? undefined : loadTree(top);
  if (top === undefined || tree === undefined) {
    return {};
  }
  const seed = {
    top,
    files: tree.files,
    links: [...tree.links],
    submodules: [...tree.submodules],
    gitPaths: tree.gitPaths,
  };
  writeFileSync(file, JSON.stringify(seed));
  return { [SEEDED_TREE_VARIABLE]: file };
}
