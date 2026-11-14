import {
  TESTS_FAILED_RULE,
  TESTS_TIMED_OUT_RULE,
  TESTS_FAILED_SCOPE_SEPARATOR,
  testsFailOnBase,
} from '../../../../shared/rules/finding-helpers.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { failingTestsText } from '../../builds/test-failures.mjs';
import { fieldOf, fieldsOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import type { JavaFinding, JavaPolicy } from '../typed/java-values.mts';

type TestsFailure = Readonly<Record<string, unknown>> & {
  readonly module: string;
  readonly tests: readonly string[];
  readonly roots?: readonly string[];
  readonly timedOut?: TimedOut;
};
type TimedOut = { readonly build: string; readonly minutes: number };
type Snapshot = 'base' | 'head';
type FailingRun<O> = (
  projectRoot: string,
  options: O & {
    readonly testsFailedModules: readonly string[];
    readonly testsSkipped?: boolean;
  },
) => void;
type FailingRuns<O> = {
  readonly run: FailingRun<O>;
  readonly projectRoot: string;
  readonly options: O;
};

const ROOT_MODULE = '.';
export const HEAD_TESTS_TOOL = 'tests';
const HEAD_CONSEQUENCE = 'coverage, CRAP and mutation were skipped, the other checks ran';
const MODULE_CONSEQUENCE = 'coverage, CRAP and mutation were skipped there, the other checks ran';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HEAD_MESSAGE_LENGTH = 40_000;
const OWN_ROOT_LISTS = [
  'sourceRoots',
  'kotlinSourceRoots',
  'testSourceRoots',
  'kotlinTestSourceRoots',
];

function timedOutOf(value: unknown): TimedOut {
  const minutes = fieldOf(value, 'minutes');
  return {
    build: textOf(fieldOf(value, 'build')),
    minutes: typeof minutes === 'number' ? minutes : 0,
  };
}

function failuresOf(value: unknown): TestsFailure[] {
  return listOf(value).map((failure) => {
    const roots = fieldOf(failure, 'roots');
    const timedOut = fieldOf(failure, 'timedOut');
    return {
      ...fieldsOf(failure),
      module: textOf(fieldOf(failure, 'module')),
      tests: textsOf(fieldOf(failure, 'tests')),
      ...(roots === undefined ? {} : { roots: textsOf(roots) }),
      ...(timedOut === undefined ? {} : { timedOut: timedOutOf(timedOut) }),
    };
  });
}

export function ownSourceRoots(manifest: unknown): string[] {
  return OWN_ROOT_LISTS.flatMap((list) => textsOf(fieldOf(manifest, list)));
}

export function withRootSourceRoots(failures: unknown, modules: unknown): TestsFailure[] {
  const root = listOf(modules).find((module) => fieldOf(module, 'dir') === '');
  const roots = ownSourceRoots(fieldOf(root, 'manifest'));
  return failuresOf(failures).map((failure) =>
    failure.module === ROOT_MODULE && failure.timedOut === undefined
      ? { ...failure, roots }
      : failure,
  );
}

export function isTestFailure(error: unknown): boolean {
  return listOf(fieldOf(error, 'failures')).length > 0;
}

export function isTestsTimeout(error: unknown, policy: unknown): boolean {
  return fieldOf(error, 'timedOut') !== undefined && fieldOf(policy, 'quick') !== true;
}

export function timedOutTests(timedOut: unknown): TestsFailure {
  return { module: ROOT_MODULE, tests: [], timedOut: timedOutOf(timedOut) };
}

export function runOrNoteFailingTests<O extends { readonly policy?: JavaPolicy | undefined }>(
  run: FailingRun<O>,
  projectRoot: string,
  options: O,
): TestsFailure[] {
  try {
    run(projectRoot, { ...options, testsFailedModules: [] });
    return [];
  } catch (error) {
    if (isTestsTimeout(error, options.policy)) {
      run(projectRoot, { ...options, testsFailedModules: [], testsSkipped: true });
      return [timedOutTests(fieldOf(error, 'timedOut'))];
    }
    if (!isTestFailure(error)) {
      throw error;
    }
    const failures = failuresOf(fieldOf(error, 'failures'));
    return rerunWithoutFailingTests({ run, projectRoot, options }, failures);
  }
}

function modulesOf(failures: readonly TestsFailure[]): string[] {
  return [...new Set(failures.map(({ module }) => module))];
}

function rerunWithoutFailingTests<O>(
  { run, projectRoot, options }: FailingRuns<O>,
  failures: readonly TestsFailure[],
): TestsFailure[] {
  try {
    run(projectRoot, { ...options, testsFailedModules: modulesOf(failures) });
    return [...failures];
  } catch (error) {
    if (!isTestFailure(error)) {
      throw error;
    }
    const all = [...failures, ...failuresOf(fieldOf(error, 'failures'))];
    run(projectRoot, { ...options, testsFailedModules: modulesOf(all) });
    return all;
  }
}

function timeoutMessage({ build, minutes }: TimedOut, snapshot: Snapshot): string {
  const where = snapshot === 'base' ? ' on the base' : '';
  return (
    `${build} did not finish the tests, coverage and mutation testing${where} within ` +
    `${String(minutes)} minutes, so they were skipped and the other checks ran without them. ` +
    `Set NITPICKER_${build.toUpperCase()}_TIMEOUT_MINUTES to give each ${build} command more time`
  );
}

function cutMessage(message: string, limit = MAX_MESSAGE_LENGTH): string {
  return message.length > limit ? `${message.slice(0, limit)}...` : message;
}

function failureMessage(failure: TestsFailure, snapshot: Snapshot): string {
  if (failure.timedOut !== undefined) {
    return timeoutMessage(failure.timedOut, snapshot);
  }
  if (snapshot !== 'base') {
    const consequence = failure.module === ROOT_MODULE ? HEAD_CONSEQUENCE : MODULE_CONSEQUENCE;
    return cutMessage(textOf(failingTestsText([failure], consequence)), MAX_HEAD_MESSAGE_LENGTH);
  }
  const { module, tests } = failure;
  return textOf(
    withTroubleshooting(
      cutMessage(textOf(testsFailOnBase(tests, module === ROOT_MODULE ? '' : ` in ${module}`))),
      TROUBLESHOOTING_ANCHORS.baseTestsFail,
    ),
  );
}

export function testsFailedFinding(
  preset: string,
  failure: TestsFailure,
  snapshot: Snapshot = 'base',
): JavaFinding {
  const { module, roots = [] } = failure;
  const rule = failure.timedOut === undefined ? TESTS_FAILED_RULE : TESTS_TIMED_OUT_RULE;
  return {
    tool: snapshot === 'base' ? preset : HEAD_TESTS_TOOL,
    rule,
    path: '.',
    identity: module === ROOT_MODULE ? rule : `${rule}:${module}`,
    message: failureMessage(failure, snapshot),
    classification: 'tool-error',
    symbol:
      module === ROOT_MODULE && roots.length > 0
        ? roots.join(TESTS_FAILED_SCOPE_SEPARATOR)
        : module,
  };
}

export function withTestsFailures(
  findings: readonly JavaFinding[],
  {
    preset,
    failures = [],
    snapshot = 'base',
  }: { readonly preset: string; readonly failures?: unknown; readonly snapshot?: Snapshot },
): JavaFinding[] {
  return [
    ...findings,
    ...failuresOf(failures).map((failure) => testsFailedFinding(preset, failure, snapshot)),
  ];
}
