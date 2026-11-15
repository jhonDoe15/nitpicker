import { TESTS_FAILED_SKIPPED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import { execute, run } from '../../execution/python-process.mts';
import { pytestCommand } from '../../execution/python-test-runner.mts';
import { failingModules, readJunit } from '../../test-runs/junit-results.mts';
import { snapshotScope } from '../../test-runs/test-failures.mts';
import { MUTANTS_DIRECTORY } from '../python-mutation-data.mts';
import { mutmutEnvironment } from './python-mutation-runner.mts';
import type { IngestedFinding } from '../../../ingest/typed/ingest-types.mts';
import type { ToolContext } from '../../typed/context/tool-context-types.mts';

type Version = readonly [number, number];

const MUTMUT_TOOL = 'mutmut';
const MINIMUM_PYTHON: Version = [3, 10];
const PYTHON_VERSION_PROBE = ['python', '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'];
const VERSION = /^(\d+)\.(\d+)$/mu;
const STATS_FAILURE = /failed to collect stats\. runner returned (\d+)/u;
const NO_TESTS_EXIT = '5';
const CLEAN_RUN_FAILURE = 'Failed to run clean test';

function mutmutError(rule: string, message: string): IngestedFinding {
  return {
    tool: MUTMUT_TOOL,
    rule,
    path: '.',
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

function pythonVersion(context: ToolContext): Version | undefined {
  const result = execute(context, PYTHON_VERSION_PROBE);
  const output = result.status === 0 ? result.stdout.trim() : '';
  const [, major, minor] = VERSION.exec(output) ?? [];
  return major === undefined ? undefined : [Number(major), Number(minor)];
}

function tooOld([major, minor]: Version): boolean {
  return major < MINIMUM_PYTHON[0] || (major === MINIMUM_PYTHON[0] && minor < MINIMUM_PYTHON[1]);
}

export function pythonVersionSkip(context: ToolContext): IngestedFinding | undefined {
  const version = pythonVersion(context);
  if (version === undefined || !tooOld(version)) {
    return undefined;
  }
  return mutmutError(
    'tool-skipped',
    `Mutation testing (mutmut) did not run in ${snapshotScope(context.snapshot)}: mutmut needs Python ${MINIMUM_PYTHON.join('.')} or newer, and the ${context.launcher.description} environment runs Python ${version.join('.')}. The other analyzers still ran.`,
  );
}

export function failedOnProjectTests(message: string): boolean {
  const stats = STATS_FAILURE.exec(message);
  return stats === null ? message.includes(CLEAN_RUN_FAILURE) : stats[1] !== NO_TESTS_EXIT;
}

export function failingTestModules(context: ToolContext): string[] {
  run(context, ['python', ...pytestCommand(context), `--ignore=${MUTANTS_DIRECTORY}`], {
    accepted: () => true,
    rule: 'mutation-failed',
    ...mutmutEnvironment(context),
  });
  return failingModules(readJunit(context.reportRoot));
}

export function everyModuleFails(
  context: ToolContext,
  modules: readonly string[],
): IngestedFinding {
  return mutmutError(
    TESTS_FAILED_SKIPPED_RULE,
    `Mutation testing (mutmut) did not run in ${snapshotScope(context.snapshot)}: every test module fails (${modules.join(', ')}), so no passing test is left to run against the mutants. Make the tests pass.`,
  );
}
