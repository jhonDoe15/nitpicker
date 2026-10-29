import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SCOPE_SEPARATOR,
  testsFailOnBase,
} from '../../../../shared/rules/finding-helpers.mjs';

const ROOT_MODULE = '.';
const MAX_MESSAGE_LENGTH = 4000;
const OWN_ROOT_LISTS = [
  'sourceRoots',
  'kotlinSourceRoots',
  'testSourceRoots',
  'kotlinTestSourceRoots',
];

export function ownSourceRoots(manifest) {
  return OWN_ROOT_LISTS.flatMap((list) => manifest?.[list] ?? []);
}

export function withRootSourceRoots(failures, modules) {
  const roots = ownSourceRoots(modules.find(({ dir }) => dir === '')?.manifest);
  return failures.map((failure) =>
    failure.module === ROOT_MODULE ? { ...failure, roots } : failure,
  );
}

export function isBaseTestFailure(error, policy) {
  return error?.failures?.length > 0 && policy?.snapshot === 'base';
}

export function runOrNoteFailingTests(run, projectRoot, options) {
  try {
    run(projectRoot, { ...options, testsFailedModules: [] });
    return [];
  } catch (error) {
    if (!isBaseTestFailure(error, options.policy)) {
      throw error;
    }
    run(projectRoot, {
      ...options,
      testsFailedModules: error.failures.map(({ module }) => module),
    });
    return error.failures;
  }
}

export function testsFailedFinding(preset, { module, tests, roots = [] }) {
  const message = testsFailOnBase(tests, module === ROOT_MODULE ? '' : ` in ${module}`);
  return {
    tool: preset,
    rule: TESTS_FAILED_RULE,
    path: '.',
    identity: module === ROOT_MODULE ? TESTS_FAILED_RULE : `${TESTS_FAILED_RULE}:${module}`,
    message:
      message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...` : message,
    classification: 'tool-error',
    symbol:
      module === ROOT_MODULE && roots.length > 0
        ? roots.join(TESTS_FAILED_SCOPE_SEPARATOR)
        : module,
  };
}

export function withTestsFailures(findings, preset, failures = []) {
  return [...findings, ...failures.map((failure) => testsFailedFinding(preset, failure))];
}
