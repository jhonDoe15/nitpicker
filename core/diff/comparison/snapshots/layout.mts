import path from 'node:path';
import {
  isStrictRule,
  mustMeetOnEditedLines,
} from '../../../../languages/typescript/preset/strict-rules.mts';
import { readRepositoryChanges } from '../../git/patches/changes.mts';
import {
  resolveBaseProjectPath,
  readProjectMoves,
  readTouchedPaths,
} from '../../git/patches/project-moves.mts';
import { readChangedLines } from '../../git/patches/changed-lines.mts';
import { readMovedPackages } from '../moved-names/packages/read-moved-packages.mts';
import { readTestRemoval } from '../../git/patches/test-removal.mts';
import {
  withTemporaryWorktree,
  withNamedTemporaryWorktree,
} from '../../git/repository/worktree.mts';
import type { ScopedMoves } from '../../git/patches/renames.mts';
import type { TouchedCode } from '../model/finding-types.mts';
import type { DeclaredMoves } from '../moved-names/declared/move-types.mts';
import type { SharedWorktree, SnapshotRoots } from './run-types.mts';

export type Comparison = {
  readonly mergeBaseSha: string;
  readonly headSha: string;
  readonly [field: string]: unknown;
};

type Moves = ScopedMoves;

type LayoutMoves = Moves & {
  readonly packages: Map<string, string>;
  readonly declared: DeclaredMoves;
};

export type SnapshotLayout = {
  readonly baseProjectRelativePath: string;
  readonly moves: LayoutMoves;
  readonly touchedPaths: ReadonlySet<string>;
  readonly touchedCode: TouchedCode;
};

type Project = {
  readonly repositoryRoot: string;
  readonly projectRelativePath: string;
  readonly warn?: ((message: string) => void) | undefined;
  readonly sharedBaseWorktree?: SharedWorktree | undefined;
  readonly sharedHeadWorktree?: SharedWorktree | undefined;
};

export function readSnapshotLayout(
  { repositoryRoot, projectRelativePath }: Project,
  { mergeBaseSha, headSha }: Comparison,
): SnapshotLayout {
  const range = { repositoryRoot, mergeBaseSha, headSha, projectRelativePath };
  const changes = readRepositoryChanges({ repositoryRoot, mergeBaseSha, headSha });
  const baseProjectRelativePath = resolveBaseProjectPath({ ...range, changes });
  const projectRange = { ...range, baseProjectRelativePath };
  const moves = readProjectMoves({ ...projectRange, changes });
  const { testsRemoved, removedTestTargets } = readTestRemoval(projectRange);
  return {
    baseProjectRelativePath,
    moves: { ...moves, ...readMovedPackages(moves, projectRange) },
    touchedPaths: readTouchedPaths({ ...projectRange, changes }),
    touchedCode: {
      changedLines: readChangedLines({ ...projectRange, inferredMoves: moves.inferred }),
      isStrictRule,
      mustMeetOnEditedLines,
      testsRemoved,
      removedTestTargets:
        removedTestTargets &&
        new Set([...removedTestTargets].map((target) => moves.files.get(target) ?? target)),
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
  const shared =
    settings.sharedBaseWorktree?.commitSha === comparison.mergeBaseSha
      ? settings.sharedBaseWorktree
      : undefined;
  const sharedHead =
    settings.sharedHeadWorktree?.commitSha === comparison.headSha
      ? settings.sharedHeadWorktree
      : undefined;
  function withHead(baseWorktreeRoot: string): T {
    function inHead(headWorktreeRoot: string): T {
      return operation({
        baseProjectRoot: path.join(baseWorktreeRoot, layout.baseProjectRelativePath),
        headSnapshotRoot: path.join(headWorktreeRoot, projectRelativePath),
        sharedBase: shared,
        sharedHead,
      });
    }
    return sharedHead === undefined
      ? withNamedTemporaryWorktree(
          repositoryRoot,
          { commitSha: comparison.headSha, directoryName: 'head', warn },
          inHead,
        )
      : inHead(sharedHead.root);
  }
  return shared === undefined
    ? withTemporaryWorktree(repositoryRoot, { commitSha: comparison.mergeBaseSha, warn }, withHead)
    : withHead(shared.root);
}
