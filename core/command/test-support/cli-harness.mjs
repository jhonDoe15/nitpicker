import path from 'node:path';
import { runTasksInProcess } from '../../diff/execution/test-support/in-process-analyzers.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';

export { crashingAnalyzer, fakeAnalyzer } from './fake-analyzers.mjs';

const discardedProgress = { write() {} };

const COMPARISON_BASE_REF = 'comparison-base';

export function useCliFixtures(runNitpickerCli) {
  const git = useGitFixtures();

  function runCli(options) {
    return runNitpickerCli({
      runTasks: runTasksInProcess,
      progress: discardedProgress,
      environment: {},
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
