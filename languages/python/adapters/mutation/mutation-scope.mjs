import { TESTS_FAILED_SKIPPED_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import { execute, run } from '../execution/python-process.mjs';
import { pytestCommand } from '../execution/python-test-runner.mjs';
import { pinnedEnvironmentAddopts } from '../test-runs/pytest-pins.mjs';
import { failingModules, readJunit } from '../test-runs/junit-results.mjs';
import { snapshotScope } from '../test-runs/test-failures.mjs';
import { MUTANTS_DIRECTORY } from './python-mutation-data.mjs';

const MUTMUT_TOOL = 'mutmut';
const MINIMUM_PYTHON = [3, 10];
const PYTHON_VERSION_PROBE = ['python', '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'];
const VERSION = /^(\d+)\.(\d+)$/mu;
const STATS_FAILURE = /failed to collect stats\. runner returned (\d+)/u;
const NO_TESTS_EXIT = '5';
const CLEAN_RUN_FAILURE = 'Failed to run clean test';

function mutmutError(rule, message) {
  return {
    tool: MUTMUT_TOOL,
    rule,
    path: '.',
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

function pythonVersion(context) {
  const result = execute(context, PYTHON_VERSION_PROBE);
  const match = result.status === 0 ? VERSION.exec(result.stdout.trim()) : null;
  return match === null ? undefined : [Number(match[1]), Number(match[2])];
}

function tooOld([major, minor]) {
  return major < MINIMUM_PYTHON[0] || (major === MINIMUM_PYTHON[0] && minor < MINIMUM_PYTHON[1]);
}

/** A tool-skipped error when the project environment runs a Python mutmut does not support. */
export function pythonVersionSkip(context) {
  const version = pythonVersion(context);
  if (version === undefined || !tooOld(version)) {
    return undefined;
  }
  return mutmutError(
    'tool-skipped',
    `Mutation testing (mutmut) did not run in ${snapshotScope(context.snapshot)}: mutmut needs Python ${MINIMUM_PYTHON.join('.')} or newer, and the ${context.launcher.description} environment runs Python ${version.join('.')}. The other analyzers still ran.`,
  );
}

/** Whether a failed mutmut run failed because the project tests fail before any mutant runs. */
export function failedOnProjectTests(message) {
  const stats = STATS_FAILURE.exec(message);
  return stats === null ? message.includes(CLEAN_RUN_FAILURE) : stats[1] !== NO_TESTS_EXIT;
}

/**
 * Runs pytest once on the snapshot itself (not mutmut's copy in mutants/) and names the test
 * modules that fail or cannot be collected.
 */
export function failingTestModules(context) {
  run(context, ['python', ...pytestCommand(context), `--ignore=${MUTANTS_DIRECTORY}`], {
    accepted: () => true,
    rule: 'mutation-failed',
    env: pinnedEnvironmentAddopts(process.env.PYTEST_ADDOPTS),
  });
  return failingModules(readJunit(context.reportRoot));
}

/** The error that says mutation testing skipped because every test module fails. */
export function everyModuleFails(context, modules) {
  return mutmutError(
    TESTS_FAILED_SKIPPED_RULE,
    `Mutation testing (mutmut) did not run in ${snapshotScope(context.snapshot)}: every test module fails (${modules.join(', ')}), so no passing test is left to run against the mutants. Make the tests pass.`,
  );
}
