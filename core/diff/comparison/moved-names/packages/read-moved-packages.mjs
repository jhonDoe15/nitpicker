import { directoryOf } from '../../../git/patches/renames.mjs';
import { repositoryPath } from '../../../git/paths.mjs';
import { declaredMoves } from '../declared/declared-moves.mjs';
import {
  filesMentioning,
  isJvm,
  packagesOf,
  textsOf,
  treeEntries,
} from '../declared/git-sources.mjs';
import { movedFolders } from '../module-folders.mjs';
import { movedPackages } from './moved-packages.mjs';

const NO_DECLARED = {
  names: new Map(),
  bare: new Map(),
  filePackages: new Map(),
  covered: new Set(),
  folders: new Map(),
  packageDirs: new Set(),
};

function sideOf(snapshot, { sha, scope }) {
  const { repositoryRoot } = snapshot;
  return { repositoryRoot, sha, scope: repositoryPath(scope), tree: new Map() };
}

function changedPackages(declared) {
  return [
    ...new Set(
      [...declared.filePackages.values()].flatMap((moved) => [...moved.keys(), ...moved.values()]),
    ),
  ];
}

function packageDirectories(files) {
  return new Set(
    files.filter((file) => file.endsWith('__init__.py')).map((file) => directoryOf(file)),
  );
}

function withMentions(side, names, renamed) {
  const mentioned = filesMentioning(side, names);
  if (mentioned === undefined) {
    return undefined;
  }
  return [...new Set([...mentioned, ...renamed].filter((file) => side.tree.has(file)))];
}

function declarationsOf(side, files) {
  const packages = files === undefined ? undefined : packagesOf(side, files);
  return packages !== undefined && packages.size === files.length ? packages : undefined;
}

function wideDeclarations(sides, { declared, renames }) {
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

export function readMovedPackages(moves, snapshot) {
  if (moves.files.size === 0) {
    return { packages: new Map(), declared: NO_DECLARED };
  }
  const sides = {
    base: sideOf(snapshot, {
      sha: snapshot.mergeBaseSha,
      scope: snapshot.baseProjectRelativePath,
    }),
    head: sideOf(snapshot, { sha: snapshot.headSha, scope: snapshot.projectRelativePath }),
  };
  sides.base.tree = treeEntries(sides.base);
  sides.head.tree = treeEntries(sides.head);
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
