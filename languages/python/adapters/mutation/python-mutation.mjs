import { rmSync } from 'node:fs';
import path from 'node:path';
import { ingestMutmut, SUPPORTED_MUTMUT } from '../../ingest/mutmut.mjs';
import {
  collectRunData,
  MUTANTS_DIRECTORY,
  NO_COVERAGE_EXIT_CODE,
} from './python-mutation-data.mjs';
import { seedMutantsFromBase } from './python-mutation-reuse.mjs';
import { writeMutmutConfig } from '../project-tools/mutmut/mutmut-config.mjs';
import { probeVersion, run } from '../execution/python-process.mjs';
import { mutmutPytestEnvironment } from '../execution/python-test-runner.mjs';
import { mutationMarkerFindings } from './mutation-markers.mjs';
import {
  everyModuleFails,
  failedOnProjectTests,
  failingTestModules,
  pythonVersionSkip,
} from './mutation-scope.mjs';

export const MUTATION_FAILED_RULE = 'mutation-failed';
export const MUTATION_SKIPPED_RULE = 'mutation-skipped';
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
const DISABLE_HINT =
  'To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.';
const SUPPORTED_MAJOR = /^3\./u;

function failure(message) {
  return Object.assign(new Error(message), { rule: MUTATION_FAILED_RULE });
}

function finishedRun({ status, stdout, stderr }) {
  const output = `${stdout}${stderr}`;
  return (
    status === 0 ||
    (status === 1 && (output.includes(NOTHING_COVERED) || output.includes(NO_TESTS_COLLECTED)))
  );
}

function checkInstallation(context) {
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
}

function runMutmut(context, ignored = []) {
  return run(context, ['mutmut', 'run'], {
    accepted: finishedRun,
    rule: MUTATION_FAILED_RULE,
    timeoutMs: MUTATION_TIMEOUT_MS,
    env: mutmutPytestEnvironment(context, ignored),
  });
}

function withCopyHint(error) {
  return error.message.includes(STATS_FAILURE) ? failure(`${error.message}\n${COPY_HINT}`) : error;
}

function runPassingTests(context) {
  try {
    return { result: runMutmut(context), ignored: [] };
  } catch (error) {
    if (!failedOnProjectTests(error.message)) {
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

function mutantRunData(context) {
  const mutants = path.join(context.projectRoot, MUTANTS_DIRECTORY);
  rmSync(mutants, { recursive: true, force: true });
  writeMutmutConfig({ context, fail: failure });
  seedMutantsFromBase(context);
  const { result, ignored } = runPassingTests(context);
  if (`${result.stdout}${result.stderr}`.includes(NO_TESTS_COLLECTED)) {
    return ignored.length === 0
      ? { findings: [] }
      : { findings: [everyModuleFails(context, ignored)] };
  }
  const data = collectRunData({
    projectRoot: context.projectRoot,
    uncheckedExitCode: result.status === 0 ? undefined : NO_COVERAGE_EXIT_CODE,
  });
  return { findings: ingestMutmut(data).findings };
}

function skippedOnWindows() {
  return {
    tool: 'mutmut',
    rule: MUTATION_SKIPPED_RULE,
    path: '.',
    identity: 'windows',
    message: `Mutation testing was skipped: mutmut needs POSIX fork and does not run on native Windows. Run nitpicker inside WSL to enable it. ${DISABLE_HINT}`,
    classification: 'descriptive',
  };
}

export function mutationFindings(context, platform = process.platform) {
  if (platform === 'win32') {
    return [skippedOnWindows()];
  }
  const skipped = pythonVersionSkip(context);
  if (skipped !== undefined) {
    return [skipped];
  }
  checkInstallation(context);
  const markers = mutationMarkerFindings(context);
  try {
    return [...markers, ...mutantRunData(context).findings];
  } finally {
    if (context.snapshot !== 'base') {
      rmSync(path.join(context.projectRoot, MUTANTS_DIRECTORY), { recursive: true, force: true });
    }
  }
}
