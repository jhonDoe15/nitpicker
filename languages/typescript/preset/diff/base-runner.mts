import type {
  BaseContext,
  BaseSetup,
  NamedAnalyzer,
  TestsPolicy,
} from './typed/analyzer-types.mts';
import type { HeadPolicyFile } from '../typed/head-policy-types.mts';
import { runnerInstallation } from '../../adapters/test-runners/installation/runner-installation.mts';
import { resolveLayoutFor } from '../layout.mts';
import { runnerDetection } from '../test-runner/detect-runner.mts';
import { recordedTestRunner } from '../test-runner/vocabulary/runner-vocabulary.mts';
import { RUNNER_NAMES, RUNNER_PACKAGES } from '../test-runner/runners.mts';
import { runnerTestFileFacts } from '../test-runner/test-files/runner-test-files.mts';

const BASE_TEST_ANALYZERS = new Set(['coverage', 'crap']);
const runnerNames: Readonly<Record<string, string>> = RUNNER_NAMES;
const runnerPackages: Readonly<Record<string, string>> = RUNNER_PACKAGES;
const HEAD_ONLY_FACTS = new Set(['runnerAmbiguity', 'notices']);

function hasTests(policy: HeadPolicyFile): policy is TestsPolicy {
  return policy.tools?.tests !== undefined;
}

function baseRunnerPolicy(setup: BaseSetup, headPolicy: TestsPolicy): TestsPolicy {
  const own = setup.headPolicy;
  if (own === undefined) {
    return headPolicy;
  }
  return {
    ...own,
    tools: { ...own.tools, tests: { ...headPolicy.tools.tests, ...own.tools?.tests } },
  };
}

function baseOnlyLayout(policy: TestsPolicy): ReturnType<typeof resolveLayoutFor> {
  const { runner } = policy.tools.tests;
  const tests = runner === undefined ? {} : { runner };
  return resolveLayoutFor({ ...policy, tools: { ...policy.tools, tests } });
}

function baseRunnerFor(policy: TestsPolicy, baseProjectRoot: string): string | undefined {
  return (
    policy.tools.tests.runner ??
    runnerDetection(baseProjectRoot, baseOnlyLayout(policy)).runner ??
    policy.tools.tests.detectedRunner
  );
}

function withSnapshotRunner(
  policy: TestsPolicy,
  runner: string | undefined,
  { baseProjectRoot, liveProjectRoot }: BaseContext,
): HeadPolicyFile {
  const tests = Object.entries(policy.tools.tests).filter(([key]) => !HEAD_ONLY_FACTS.has(key));
  const { testFiles } = runnerTestFileFacts(baseProjectRoot, {
    configured: runner,
    layout: baseOnlyLayout(policy),
    liveProjectRoot,
  });
  return {
    ...policy,
    tools: {
      ...policy.tools,
      tests: {
        ...Object.fromEntries(tests),
        snapshotRunner: runner,
        detectedRunner: runner,
        testFiles,
      },
    },
  };
}

function runnerName(runner: string | undefined): string {
  return (runner === undefined ? undefined : runnerNames[runner]) ?? 'undefined';
}

function runnerPackage(runner: string | undefined): string {
  return (runner === undefined ? undefined : runnerPackages[runner]) ?? 'undefined';
}

function missingRunnerNotice(
  baseRunner: string | undefined,
  headRunner: string | undefined,
): string {
  return (
    `The base runs its tests with ${runnerName(baseRunner)} and the head with ` +
    `${runnerName(headRunner)}, but ${runnerPackage(baseRunner)} is not installed, ` +
    'so coverage and CRAP are not compared on this change.'
  );
}

function withoutBaseTests(
  setup: BaseSetup,
  { analyzers, policy }: { analyzers: readonly NamedAnalyzer[]; policy: HeadPolicyFile },
): BaseSetup {
  return {
    ...setup,
    headPolicy: policy,
    analyzers: (setup.analyzers ?? analyzers).filter(({ name }) => !BASE_TEST_ANALYZERS.has(name)),
  };
}

export function withBaseTestRunner(setup: BaseSetup, context: BaseContext): BaseSetup {
  const { headPolicy, baseProjectRoot, liveProjectRoot, warn } = context;
  if (headPolicy === undefined || !hasTests(headPolicy)) {
    return setup;
  }
  const policy = baseRunnerPolicy(setup, headPolicy);
  const baseRunner = baseRunnerFor(policy, baseProjectRoot);
  const headRunner = recordedTestRunner(headPolicy);
  if (baseRunner === headRunner) {
    return setup.headPolicy === undefined ? setup : { ...setup, headPolicy: policy };
  }
  if (baseRunner === undefined || runnerInstallation(baseRunner, liveProjectRoot).installed) {
    return { ...setup, headPolicy: withSnapshotRunner(policy, baseRunner, context) };
  }
  warn(missingRunnerNotice(baseRunner, headRunner));
  return withoutBaseTests(setup, { analyzers: context.analyzers, policy });
}
