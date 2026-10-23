import { escapeRegExp } from '../paths/glob.mjs';
import { docsUrl } from './docs-url.mjs';

export const TROUBLESHOOTING_FILE = 'docs/troubleshooting.md';

export const TROUBLESHOOTING_ANCHORS = {
  exitCode2: 'exit-code-2-and-tool-errors',
  invalidArguments: 'invalid-arguments',
  invalidConfiguration: 'invalid-configuration',
  notAGitRepository: 'not-a-git-repository',
  noProjectFound: 'no-project-found',
  noBase: 'no-base-could-be-determined',
  baseRefNotFound: 'base-ref-not-found',
  noMergeBase: 'no-merge-base',
  testsFail: 'tests-fail',
  baseTestsFail: 'tests-fail-on-the-base',
  baseDoesNotTypeCheck: 'the-base-does-not-type-check',
  noTestsRan: 'the-test-runner-ran-no-tests',
  testRunnerNotInstalled: 'a-test-runner-is-not-installed',
  jestNoCoverage: 'jest-collects-no-coverage',
  missingPeer: 'a-peer-tool-is-missing',
  dependenciesNotInstalled: 'dependencies-are-not-installed',
  baseInstallFails: 'installing-the-base-dependencies-fails',
  packageManagerMissing: 'the-package-manager-is-not-installed',
  unsupportedYarn: 'unsupported-yarn-setup',
  engineUnavailable: 'the-lint-or-type-check-engine-cannot-run',
  typescriptConfigUnreadable: 'the-typescript-config-cannot-be-read',
  mutationUnsupportedRunner: 'mutation-testing-is-skipped-for-this-runner',
  testTimeoutsNeedVitest: 'test-timeouts-need-vitest',
  projectToolConfigMissing: 'a-project-tool-config-is-missing-or-broken',
  policyLoosened: 'a-policy-loosened-finding',
  anotherRun: 'another-run-is-in-progress',
  staleCache: 'a-stale-or-shared-cache',
  cachePublishFails: 'cache-publish-fails',
  analyzerTimeout: 'an-analyzer-times-out',
  analyzerCrashed: 'an-analyzer-crashes',
  shardAggregationFails: 'shard-aggregation-fails',
  fixersFail: 'fixers-fail',
  tooManyStyleFiles: 'too-many-style-files',
  windowsAndWsl: 'windows-and-wsl',
  pythonEnvironment: 'the-python-environment-cannot-be-found',
  pythonToolMissing: 'a-python-tool-is-missing',
  pythonBaseEnvironment: 'the-base-needs-its-own-python-environment',
  pythonToolFails: 'a-python-tool-fails',
  mutmutFails: 'mutmut-fails',
  gradleFails: 'the-gradle-build-fails',
  mavenFails: 'the-maven-build-fails',
  buildToolNotFound: 'gradle-maven-or-java-is-not-found',
  buildTimeout: 'gradle-or-maven-times-out',
  errorProneJdk: 'error-prone-cannot-find-a-jdk',
};

const LINK_SENTENCE = new RegExp(
  `See https://\\S+/${escapeRegExp(TROUBLESHOOTING_FILE)}#[a-z0-9-]+`,
  'u',
);

export function troubleshootingUrl(anchor) {
  return docsUrl(TROUBLESHOOTING_FILE, anchor);
}

export function troubleshootingLinkOf(message) {
  return LINK_SENTENCE.exec(message)?.[0];
}

export function troubleshootingSentence(anchor) {
  return `See ${troubleshootingUrl(anchor)}`;
}

export function withTroubleshooting(message, anchor) {
  if (troubleshootingLinkOf(message) !== undefined) {
    return message;
  }
  const sentence = troubleshootingSentence(anchor);
  if (message.includes('\n')) {
    return `${message.trimEnd()}\n${sentence}`;
  }
  return `${message.replace(/\.?\s*$/u, '')}. ${sentence}`;
}

export function testsFailAnchor(snapshot) {
  return snapshot === 'base'
    ? TROUBLESHOOTING_ANCHORS.baseTestsFail
    : TROUBLESHOOTING_ANCHORS.testsFail;
}

export function troubleshootingError(message, anchor, options) {
  return new Error(withTroubleshooting(message, anchor), options);
}

export function withUsageLink(message) {
  return withTroubleshooting(message, TROUBLESHOOTING_ANCHORS.invalidArguments);
}

export function usageError(message) {
  return new Error(withUsageLink(message));
}
