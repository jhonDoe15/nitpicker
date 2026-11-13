import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SCOPE_SEPARATOR,
  testsFailOnBase,
} from '../../../../shared/rules/finding-helpers.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { fieldOf, fieldsOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import type { JavaFinding, JavaPolicy } from '../typed/java-values.mts';

type TestsFailure = Readonly<Record<string, unknown>> & {
  readonly module: string;
  readonly tests: readonly string[];
  readonly roots?: readonly string[];
};
type FailingRun<O> = (
  projectRoot: string,
  options: O & { readonly testsFailedModules: readonly string[] },
) => void;

const ROOT_MODULE = '.';
const MAX_MESSAGE_LENGTH = 4000;
const OWN_ROOT_LISTS = [
  'sourceRoots',
  'kotlinSourceRoots',
  'testSourceRoots',
  'kotlinTestSourceRoots',
];

function failuresOf(value: unknown): TestsFailure[] {
  return listOf(value).map((failure) => {
    const roots = fieldOf(failure, 'roots');
    return {
      ...fieldsOf(failure),
      module: textOf(fieldOf(failure, 'module')),
      tests: textsOf(fieldOf(failure, 'tests')),
      ...(roots === undefined ? {} : { roots: textsOf(roots) }),
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
    failure.module === ROOT_MODULE ? { ...failure, roots } : failure,
  );
}

export function isBaseTestFailure(error: unknown, policy: JavaPolicy | undefined): boolean {
  return listOf(fieldOf(error, 'failures')).length > 0 && policy?.snapshot === 'base';
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
    if (!isBaseTestFailure(error, options.policy)) {
      throw error;
    }
    const failures = failuresOf(fieldOf(error, 'failures'));
    run(projectRoot, { ...options, testsFailedModules: failures.map(({ module }) => module) });
    return failures;
  }
}

export function testsFailedFinding(
  preset: string,
  { module, tests, roots = [] }: TestsFailure,
): JavaFinding {
  const message = textOf(testsFailOnBase(tests, module === ROOT_MODULE ? '' : ` in ${module}`));
  return {
    tool: preset,
    rule: TESTS_FAILED_RULE,
    path: '.',
    identity: module === ROOT_MODULE ? TESTS_FAILED_RULE : `${TESTS_FAILED_RULE}:${module}`,
    message: textOf(
      withTroubleshooting(
        message.length > MAX_MESSAGE_LENGTH
          ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...`
          : message,
        TROUBLESHOOTING_ANCHORS.baseTestsFail,
      ),
    ),
    classification: 'tool-error',
    symbol:
      module === ROOT_MODULE && roots.length > 0
        ? roots.join(TESTS_FAILED_SCOPE_SEPARATOR)
        : module,
  };
}

export function withTestsFailures(
  findings: readonly JavaFinding[],
  preset: string,
  failures: unknown = [],
): JavaFinding[] {
  return [
    ...findings,
    ...failuresOf(failures).map((failure) => testsFailedFinding(preset, failure)),
  ];
}
