import path from 'node:path';
import { runTasksInProcess } from '../../diff/execution/test-support/in-process-analyzers.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';

const discardedProgress = { write() {} };

const fakeAnalyzerPath = path.join(import.meta.dirname, '../../diff/fixtures/fake-analyzer.mjs');

const COMPARISON_BASE_REF = 'comparison-base';

export function useCliFixtures(runNitpickerCli) {
  const git = useGitFixtures();

  function runCli(options) {
    return runNitpickerCli({
      runTasks: runTasksInProcess,
      progress: discardedProgress,
      ...options,
    });
  }

  function createRepository(initialFiles) {
    return git.createGitRepository(
      {
        'package.json': '{"name":"cli-fixture","version":"1.0.0"}\n',
        'package-lock.json': '{"name":"cli-fixture","lockfileVersion":3}\n',
        '.gitignore': 'node_modules/\n',
        ...initialFiles,
      },
      { prefix: 'nitpicker-cli-repo-', baseRef: COMPARISON_BASE_REF },
    );
  }

  function makeOutputRoot() {
    return path.join(git.temporaryRoot('nitpicker-cli-output-'), 'reports');
  }

  return { runCli, createRepository, makeTemporaryRoot: git.temporaryRoot, makeOutputRoot };
}

export function fakeAnalyzer(name = 'fake-quality-analyzer') {
  return {
    name,
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    findingExitCodes: [1],
    createInvocation({ projectRoot, policyRoot, toolRoot }) {
      return {
        command: process.execPath,
        args: [
          fakeAnalyzerPath,
          '--root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          toolRoot,
        ],
        cwd: policyRoot,
      };
    },
  };
}

export function crashingAnalyzer() {
  return {
    ...fakeAnalyzer('crashing-analyzer'),
    createInvocation({ policyRoot }) {
      return {
        command: process.execPath,
        args: ['-e', 'process.exit(2)'],
        cwd: policyRoot,
      };
    },
  };
}
