import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from '../../../shared/paths/checkout-module.mjs';
import type {
  CliFixtures,
  CliRunInput,
  FixtureAnalyzer,
  FixtureInvocationContext,
  FixtureRepository,
  RunNitpickerCli,
} from './fixture-types.mts';
import { runTasksInProcess } from '../../diff/execution/test-support/in-process-analyzers.mts';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mts';

const discardedProgress = { write() {} };

const fakeAnalyzerModule = '../../diff/execution/test-support/fake-analyzer.mjs';
const fakeAnalyzerPath = fileURLToPath(
  checkoutModuleUrl(new URL(fakeAnalyzerModule, import.meta.url)),
);

const COMPARISON_BASE_REF = 'comparison-base';

export function useCliFixtures(runNitpickerCli: RunNitpickerCli): CliFixtures {
  const git = useGitFixtures();

  function runCli(options: CliRunInput) {
    return runNitpickerCli({
      runTasks: runTasksInProcess,
      progress: discardedProgress,
      environment: {},
      ...options,
    });
  }

  function createRepository(initialFiles?: Readonly<Record<string, string>>): FixtureRepository {
    const repository = git.createGitRepository(
      {
        'package.json': '{"name":"cli-fixture","version":"1.0.0"}\n',
        'package-lock.json': '{"name":"cli-fixture","lockfileVersion":3}\n',
        '.gitignore': 'node_modules/\n',
        ...initialFiles,
      },
      { prefix: 'nitpicker-cli-repo-', baseRef: COMPARISON_BASE_REF },
    );
    return { ...repository, baseRef: COMPARISON_BASE_REF };
  }

  function makeOutputRoot(): string {
    return path.join(git.temporaryRoot('nitpicker-cli-output-'), 'reports');
  }

  return { runCli, createRepository, makeTemporaryRoot: git.temporaryRoot, makeOutputRoot };
}

export function fakeAnalyzer(name = 'fake-quality-analyzer'): FixtureAnalyzer {
  return {
    name,
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    findingExitCodes: [1],
    createInvocation({ projectRoot, policyRoot, toolRoot }: FixtureInvocationContext) {
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

export function crashingAnalyzer(): FixtureAnalyzer {
  return {
    ...fakeAnalyzer('crashing-analyzer'),
    createInvocation({ policyRoot }: FixtureInvocationContext) {
      return {
        command: process.execPath,
        args: ['-e', 'process.exit(2)'],
        cwd: policyRoot,
      };
    },
  };
}
