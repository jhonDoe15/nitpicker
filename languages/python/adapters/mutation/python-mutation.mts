import { rmSync } from 'node:fs';
import path from 'node:path';
import { ingestMutmut, SUPPORTED_MUTMUT } from '../../ingest/mutmut.mts';
import {
  collectRunData,
  MUTANTS_DIRECTORY,
  NO_COVERAGE_EXIT_CODE,
} from './python-mutation-data.mts';
import { seedMutantsFromBase } from './python-mutation-reuse.mts';
import { writeMutmutConfig } from '../project-tools/mutmut/mutmut-config.mts';
import { probeVersion, run } from '../execution/python-process.mts';
import { mutationMarkerFindings } from './mutation-markers.mts';
import {
  DISABLE_HINT,
  missingPytest,
  mutmutEnvironment,
  noTestsCollected,
  runnerSkip,
  skippedFinding,
} from './test-run/python-mutation-runner.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';
import type { SpawnResult } from '../execution/typed/process-types.mts';
import type { ToolContext } from '../typed/context/tool-context-types.mts';
import { messageOf } from '../../../../shared/values/readers.mts';
import {
  everyModuleFails,
  failedOnProjectTests,
  failingTestModules,
  pythonVersionSkip,
} from './test-run/mutation-scope.mts';

export const MUTATION_FAILED_RULE = 'mutation-failed';
export const MUTMUT_VERSION_PROBE = [
  'python',
  '-c',
  'import importlib.metadata; print(importlib.metadata.version("mutmut"))',
];
const MUTATION_TIMEOUT_MS = 60 * 60 * 1000;
const NOTHING_COVERED = 'could not find any test case for any mutant';
const NO_TESTS_COLLECTED = 'failed to collect stats. runner returned 5';
const STATS_FAILURE = 'failed to collect stats';
const COPY_HINT =
  'If the tests read files outside the source roots, list them under "also_copy" in [tool.mutmut] of pyproject.toml.';
const SUPPORTED_MAJOR = /^3\./u;

function failure(message: string): Error & { rule: string } {
  return Object.assign(new Error(message), { rule: MUTATION_FAILED_RULE });
}

function finishedRun({ status, stdout, stderr }: SpawnResult): boolean {
  const output = `${stdout}${stderr}`;
  return (
    status === 0 ||
    (status === 1 && (output.includes(NOTHING_COVERED) || output.includes(NO_TESTS_COLLECTED)))
  );
}

function checkInstallation(context: ToolContext): void {
  const version = probeVersion(context, MUTMUT_VERSION_PROBE);
  if (version === 'missing') {
    throw failure(
      `mutmut was not found in the ${context.launcher.description} environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it. ${DISABLE_HINT}`,
    );
  }
  if (version !== 'unknown' && !SUPPORTED_MAJOR.test(version)) {
    throw failure(
      `mutmut ${version} is not supported: nitpicker reads the run data of ${SUPPORTED_MUTMUT}. ${DISABLE_HINT}`,
    );
  }
  const pytestProblem = missingPytest(context);
  if (pytestProblem !== undefined) {
    throw failure(pytestProblem);
  }
}

function runMutmut(context: ToolContext, ignored: readonly string[] = []): SpawnResult {
  return run(context, ['mutmut', 'run'], {
    accepted: finishedRun,
    rule: MUTATION_FAILED_RULE,
    timeoutMs: context.analyzerDeadlineMs ?? MUTATION_TIMEOUT_MS,
    ...mutmutEnvironment(context, ignored),
  });
}

function withCopyHint(error: unknown): unknown {
  const message = messageOf(error);
  return message.includes(STATS_FAILURE) ? failure(`${message}\n${COPY_HINT}`) : error;
}

function runPassingTests(context: ToolContext): { result: SpawnResult; ignored: string[] } {
  try {
    return { result: runMutmut(context), ignored: [] };
  } catch (error) {
    if (!failedOnProjectTests(messageOf(error))) {
      throw withCopyHint(error);
    }
    const ignored = failingTestModules(context);
    if (ignored.length === 0) {
      throw withCopyHint(error);
    }
    try {
      return { result: runMutmut(context, ignored), ignored };
    } catch (retryError) {
      throw withCopyHint(retryError);
    }
  }
}

function mutantRunData(context: ToolContext): { findings: IngestedFinding[] } {
  const mutants = path.join(context.projectRoot, MUTANTS_DIRECTORY);
  rmSync(mutants, { recursive: true, force: true });
  writeMutmutConfig({ context, fail: failure });
  seedMutantsFromBase(context);
  const { result, ignored } = runPassingTests(context);
  if (`${result.stdout}${result.stderr}`.includes(NO_TESTS_COLLECTED)) {
    return {
      findings: [
        ignored.length === 0 ? noTestsCollected(context) : everyModuleFails(context, ignored),
      ],
    };
  }
  const data = collectRunData({
    projectRoot: context.projectRoot,
    uncheckedExitCode: result.status === 0 ? undefined : NO_COVERAGE_EXIT_CODE,
  });
  return { findings: ingestMutmut(data).findings };
}

function skippedOnWindows(): IngestedFinding {
  return skippedFinding(
    'windows',
    'mutmut needs POSIX fork and does not run on native Windows. Run nitpicker inside WSL to enable it.',
  );
}

export function mutationFindings(
  context: ToolContext,
  platform: string = process.platform,
): IngestedFinding[] {
  if (platform === 'win32') {
    return [skippedOnWindows()];
  }
  const skipped = pythonVersionSkip(context);
  if (skipped !== undefined) {
    return [skipped];
  }
  checkInstallation(context);
  const runnerSkipped = runnerSkip(context);
  if (runnerSkipped !== undefined) {
    return [runnerSkipped];
  }
  const markers = mutationMarkerFindings(context);
  try {
    return [...markers, ...mutantRunData(context).findings];
  } finally {
    if (context.snapshot !== 'base') {
      rmSync(path.join(context.projectRoot, MUTANTS_DIRECTORY), { recursive: true, force: true });
    }
  }
}
