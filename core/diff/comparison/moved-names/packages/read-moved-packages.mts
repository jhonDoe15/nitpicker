import { directoryOf } from '../../../git/patches/renames.mts';
import { repositoryPath } from '../../../git/paths.mts';
import { declaredMoves } from '../declared/declared-moves.mts';
import {
  filesMentioning,
  isJvm,
  type TreeSide,
  packagesOf,
  textsOf,
  treeEntries,
} from '../declared/git-sources.mts';
import { NO_DECLARED } from '../declared/no-declared-moves.mts';
import { movedFolders } from '../module-folders.mts';
import { movedPackages } from './moved-packages.mts';
import type { DeclaredFiles, DeclaredMoves } from '../declared/move-types.mts';

type Place = Omit<TreeSide, 'tree'>;

type SnapshotRange = {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
  readonly baseProjectRelativePath: string;
  readonly projectRelativePath: string;
};

type Sides = { readonly base: TreeSide; readonly head: TreeSide };

type MovedPackages = { readonly packages: Map<string, string>; readonly declared: DeclaredMoves };

function sideOf(
  snapshot: SnapshotRange,
  { sha, scope }: { readonly sha: string; readonly scope: string },
): Place {
  const { repositoryRoot } = snapshot;
  return { repositoryRoot, sha, scope: repositoryPath(scope) };
}

function changedPackages(declared: DeclaredMoves): string[] {
  return [
    ...new Set(
      [...declared.filePackages.values()].flatMap((moved) => [...moved.keys(), ...moved.values()]),
    ),
  ];
}

function packageDirectories(files: readonly string[]): Set<string> {
  return new Set(
    files.filter((file) => file.endsWith('__init__.py')).map((file) => directoryOf(file)),
  );
}

function withMentions(
  side: TreeSide,
  names: readonly string[],
  renamed: readonly string[],
): string[] | undefined {
  const mentioned = filesMentioning(side, names);
  if (mentioned === undefined) {
    return undefined;
  }
  return [...new Set([...mentioned, ...renamed].filter((file) => side.tree.has(file)))];
}

function declarationsOf(
  side: TreeSide,
  files: readonly string[] | undefined,
): Map<string, string> | undefined {
  const packages = files === undefined ? undefined : packagesOf(side, files);
  return files !== undefined && packages?.size === files.length ? packages : undefined;
}

function wideDeclarations(
  sides: Sides,
  {
    declared,
    renames,
  }: { readonly declared: DeclaredMoves; readonly renames: ReadonlyMap<string, string> },
): DeclaredFiles | undefined {
  if (declared.covered.size === 0) {
    return undefined;
  }
  const names = changedPackages(declared);
  const covered = [...renames].filter(([oldPath]) => declared.covered.has(oldPath));
  const base = declarationsOf(
    sides.base,
    withMentions(
      sides.base,
      names,
      covered.map(([oldPath]) => oldPath),
    ),
  );
  const head = declarationsOf(
    sides.head,
    withMentions(
      sides.head,
      names,
      covered.map(([, newPath]) => newPath),
    ),
  );
  return base === undefined || head === undefined
    ? { base: new Map(), head: new Map() }
    : { base, head };
}

export function readMovedPackages(
  moves: { readonly files: ReadonlyMap<string, string> },
  snapshot: SnapshotRange,
): MovedPackages {
  if (moves.files.size === 0) {
    return { packages: new Map(), declared: NO_DECLARED };
  }
  const basePlace = sideOf(snapshot, {
    sha: snapshot.mergeBaseSha,
    scope: snapshot.baseProjectRelativePath,
  });
  const headPlace = sideOf(snapshot, {
    sha: snapshot.headSha,
    scope: snapshot.projectRelativePath,
  });
  const sides: Sides = {
    base: { ...basePlace, tree: treeEntries(basePlace) },
    head: { ...headPlace, tree: treeEntries(headPlace) },
  };
  const baseFiles = [...sides.base.tree.keys()];
  const headFiles = [...sides.head.tree.keys()];
  const renames = new Map([...moves.files].filter(([oldPath]) => isJvm(oldPath)));
  const declared = {
    ...declaredMoves({
      renames,
      baseTexts: textsOf(sides.base, [...renames.keys()]),
      headTexts: textsOf(sides.head, [...renames.values()]),
    }),
    folders: movedFolders({ baseFiles, renames: moves.files }),
    packageDirs: packageDirectories(headFiles),
  };
  const wide = wideDeclarations(sides, { declared, renames });
  return {
    declared,
    packages: movedPackages({
      baseFiles,
      headFiles,
      renames: moves.files,
      declared: wide,
    }),
  };
}
