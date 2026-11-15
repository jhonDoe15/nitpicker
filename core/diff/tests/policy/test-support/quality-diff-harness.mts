import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mjs';
import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';
import type { ProfiledAnalyzer } from '../../../../../shared/values/analyzers.mts';
import type { DiffOptions } from '../../../comparison/run-diff.mts';
import type { FileMap } from '../../../git/test-support/fixture-files.mts';
import { runGit } from '../../../git/repository/command.mjs';
import { runTasksInProcess } from '../../../execution/test-support/in-process-analyzers.mts';
import { commit, useGitFixtures } from '../../../git/test-support/git-repository.mts';
import { writeFiles } from '../../../git/test-support/fixture-files.mts';

export const IN_PROCESS_TASKS = { runTasks: runTasksInProcess };

const fakeAnalyzerPath = fileURLToPath(
  checkoutModuleUrl(new URL('../../../execution/test-support/fake-analyzer.mts', import.meta.url)),
);

const COMPARISON_BASE_REF = 'comparison-base';

export const COMMON_EXCLUSIONS = [
  '**/generated/**',
  '**/*.d.ts',
  '**/node_modules/**',
  '**/reports/**',
  '**/coverage/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
];

export type QualityRepository = {
  readonly root: string;
  readonly baseSha: string;
  readonly baseRef: string;
  readonly outputRoot: string;
};

type FakeAnalyzer = ProfiledAnalyzer & Readonly<Record<string, unknown>>;

export function useQualityDiffRepositories(): {
  readonly createRepository: (initialFiles?: FileMap) => QualityRepository;
} {
  const git = useGitFixtures();

  function createRepository(initialFiles?: FileMap): QualityRepository {
    const { root, baseSha } = git.createGitRepository(initialFiles, {
      prefix: 'quality-diff-repo-',
      baseRef: COMPARISON_BASE_REF,
    });
    return {
      root,
      baseSha,
      baseRef: COMPARISON_BASE_REF,
      outputRoot: path.join(root, 'reports/quality/diff'),
    };
  }

  return { createRepository };
}

export function comparisonOptions(
  repository: QualityRepository,
  baseRef: string = repository.baseRef,
): DiffOptions {
  return {
    ...IN_PROCESS_TASKS,
    repositoryRoot: repository.root,
    projectRelativePath: '.',
    headProjectRoot: repository.root,
    requestedBaseRef: baseRef,
    outputRoot: repository.outputRoot,
    analyzers: [fakeAnalyzer()],
  };
}

export function workingTreeOptions(
  repository: QualityRepository,
  baseRef: string = repository.baseRef,
): DiffOptions {
  return { ...comparisonOptions(repository, baseRef), includeWorkingTree: true };
}

export function fakeAnalyzer(overrides: { readonly timeoutMs?: number } = {}): FakeAnalyzer {
  return {
    name: 'fake-quality-analyzer',
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: COMMON_EXCLUSIONS,
    findingExitCodes: [1],
    createInvocation(context: unknown) {
      const projectRoot = textOf(fieldOf(context, 'projectRoot'));
      const policyRoot = textOf(fieldOf(context, 'policyRoot'));
      const liveProjectRoot = textOf(fieldOf(context, 'liveProjectRoot'));
      return {
        command: process.execPath,
        args: [
          fakeAnalyzerPath,
          '--root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          liveProjectRoot,
        ],
        cwd: policyRoot,
      };
    },
    ...overrides,
  };
}

export function commitFiles(repositoryRoot: string, files: FileMap, message: string): void {
  writeFiles(repositoryRoot, files);
  commit(repositoryRoot, message);
}

export function worktreePaths(repositoryRoot: string): string[] {
  const output = runGit(repositoryRoot, ['worktree', 'list', '--porcelain']);
  return output
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}
