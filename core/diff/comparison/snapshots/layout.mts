import path from 'node:path';
import {
  isStrictRule,
  mustMeetOnEditedLines,
} from '../../../../languages/typescript/preset/strict-rules.mjs';
import { readRepositoryChanges } from '../../git/patches/changes.mjs';
import {
  resolveBaseProjectPath,
  readProjectMoves,
  readTouchedPaths,
} from '../../git/patches/project-moves.mjs';
import { readChangedLines } from '../../git/patches/changed-lines.mjs';
import { readMovedPackages } from '../moved-names/packages/read-moved-packages.mjs';
import { readRemovesTests } from '../../git/patches/test-removal.mjs';
import {
  withTemporaryWorktree,
  withNamedTemporaryWorktree,
} from '../../git/repository/worktree.mjs';
import type { SnapshotRoots } from './run-types.mts';

export type Comparison = {
  readonly mergeBaseSha: string;
  readonly headSha: string;
  readonly [field: string]: unknown;
};

type Changes = ReturnType<typeof readRepositoryChanges>;

type Moves = {
  readonly files: Map<string, string>;
  readonly directories: Map<string, string>;
  readonly inferred: Map<string, string>;
};

type LayoutMoves = Moves & { readonly packages: Map<string, string> };

type GitRange = {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
  readonly projectRelativePath: string;
};

type ProjectRange = GitRange & { readonly baseProjectRelativePath: string };

export type SnapshotLayout = {
  readonly baseProjectRelativePath: string;
  readonly moves: LayoutMoves;
  readonly touchedPaths: ReadonlySet<string>;
  readonly touchedCode: {
    readonly changedLines: ReadonlyMap<string, unknown>;
    readonly isStrictRule: unknown;
    readonly mustMeetOnEditedLines: unknown;
    readonly testsRemoved: unknown;
  };
};

type Project = {
  readonly repositoryRoot: string;
  readonly projectRelativePath: string;
  readonly warn?: unknown;
};

type Worktree = { readonly commitSha: string; readonly warn: unknown };

type NamedWorktree = Worktree & { readonly directoryName: string };

const baseProjectPath: (request: GitRange & { readonly changes: Changes }) => string =
  resolveBaseProjectPath;
const movesOf: (request: ProjectRange & { readonly changes: Changes }) => Moves = readProjectMoves;
const touchedPathsOf: (
  request: ProjectRange & { readonly changes: Changes },
) => ReadonlySet<string> = readTouchedPaths;
const changedLinesOf: (
  request: ProjectRange & { readonly inferredMoves: Moves['inferred'] },
) => ReadonlyMap<string, unknown> = readChangedLines;
const removesTests: (request: ProjectRange) => unknown = readRemovesTests;
const movedPackages: (moves: Moves, range: ProjectRange) => Map<string, string> = readMovedPackages;
const inWorktree: <T>(root: string, worktree: Worktree, operation: (root: string) => T) => T =
  withTemporaryWorktree;
const inNamedWorktree: <T>(
  root: string,
  worktree: NamedWorktree,
  operation: (root: string) => T,
) => T = withNamedTemporaryWorktree;

export function readSnapshotLayout(
  { repositoryRoot, projectRelativePath }: Project,
  { mergeBaseSha, headSha }: Comparison,
): SnapshotLayout {
  const range = { repositoryRoot, mergeBaseSha, headSha, projectRelativePath };
  const changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha });
  const baseProjectRelativePath = baseProjectPath({ ...range, changes });
  const projectRange = { ...range, baseProjectRelativePath };
  const moves = movesOf({ ...projectRange, changes });
  return {
    baseProjectRelativePath,
    moves: { ...moves, packages: movedPackages(moves, projectRange) },
    touchedPaths: touchedPathsOf({ ...projectRange, changes }),
    touchedCode: {
      changedLines: changedLinesOf({ ...projectRange, inferredMoves: moves.inferred }),
      isStrictRule,
      mustMeetOnEditedLines,
      testsRemoved: removesTests(projectRange),
    },
  };
}

export function withSnapshotRoots<T>(
  {
    settings,
    comparison,
    layout,
  }: {
    readonly settings: Project;
    readonly comparison: Comparison;
    readonly layout: SnapshotLayout;
  },
  operation: (roots: SnapshotRoots) => T,
): T {
  const { repositoryRoot, projectRelativePath, warn } = settings;
  const base = { commitSha: comparison.mergeBaseSha, warn };
  return inWorktree(repositoryRoot, base, (baseWorktreeRoot) =>
    inNamedWorktree(
      repositoryRoot,
      { commitSha: comparison.headSha, directoryName: 'head', warn },
      (headWorktreeRoot) =>
        operation({
          baseProjectRoot: path.join(baseWorktreeRoot, layout.baseProjectRelativePath),
          headSnapshotRoot: path.join(headWorktreeRoot, projectRelativePath),
        }),
    ),
  );
}
