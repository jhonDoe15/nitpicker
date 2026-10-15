import path from 'node:path';
import { runGit } from '../../../git/repository/command.mjs';
import { runTasksInProcess } from '../../../execution/test-support/in-process-analyzers.mjs';
import { commit, useGitFixtures } from '../../../git/test-support/git-repository.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';

export const IN_PROCESS_TASKS = { runTasks: runTasksInProcess };

const fakeAnalyzerPath = path.resolve(
  import.meta.dirname,
  '../../../execution/test-support/fake-analyzer.mjs',
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

export function useQualityDiffRepositories() {
  const git = useGitFixtures();

  function createRepository(initialFiles) {
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

export function comparisonOptions(repository, baseRef = repository.baseRef) {
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

export function workingTreeOptions(repository, baseRef = repository.baseRef) {
  return { ...comparisonOptions(repository, baseRef), includeWorkingTree: true };
}

export function fakeAnalyzer(overrides = {}) {
  return {
    name: 'fake-quality-analyzer',
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: COMMON_EXCLUSIONS,
    findingExitCodes: [1],
    createInvocation({ projectRoot, policyRoot, liveProjectRoot }) {
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

export function commitFiles(repositoryRoot, files, message) {
  writeFiles(repositoryRoot, files);
  commit(repositoryRoot, message);
}

export function worktreePaths(repositoryRoot) {
  const output = runGit(repositoryRoot, ['worktree', 'list', '--porcelain']);
  return output
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}
