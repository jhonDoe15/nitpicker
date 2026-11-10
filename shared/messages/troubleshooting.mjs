import { escapeRegExp } from '../paths/glob.mjs';
import { docsUrl } from './docs-url.mjs';

export const TROUBLESHOOTING_FILE = 'docs/troubleshooting.md';

export const TROUBLESHOOTING_ANCHORS = {
  exitCode2: 'exit-code-2-and-tool-errors',
  notAGitRepository: 'not-a-git-repository',
  noProjectFound: 'no-project-found',
  baseTestsFail: 'tests-fail-on-the-base',
  baseDoesNotTypeCheck: 'the-base-does-not-type-check',
  testRunnerNotInstalled: 'a-test-runner-is-not-installed',
  jestNoCoverage: 'jest-collects-no-coverage',
  missingPeer: 'a-peer-tool-is-missing',
  baseInstallFails: 'installing-the-base-dependencies-fails',
  unsupportedYarn: 'unsupported-yarn-setup',
  engineUnavailable: 'the-lint-or-type-check-engine-cannot-run',
  typescriptConfigUnreadable: 'the-typescript-config-cannot-be-read',
  typescriptToolFails: 'a-typescript-or-javascript-tool-fails',
  testTimeoutsNeedVitest: 'test-timeouts-need-vitest',
  projectToolConfigMissing: 'a-project-tool-config-is-missing-or-broken',
  policyLoosened: 'a-policy-loosened-finding',
  staleCache: 'a-stale-or-shared-cache',
  cachePublishFails: 'cache-publish-fails',
  analyzerTimeout: 'an-analyzer-times-out',
  analyzerCrashed: 'an-analyzer-crashes',
  shardAggregationFails: 'shard-aggregation-fails',
  fixersFail: 'fixers-fail',
  windowsAndWsl: 'windows-and-wsl',
  pythonEnvironment: 'the-python-environment-cannot-be-found',
  pythonToolMissing: 'a-python-tool-is-missing',
  pythonBaseEnvironment: 'the-base-needs-its-own-python-environment',
  pythonToolFails: 'a-python-tool-fails',
  mutmutFails: 'mutmut-fails',
  gradleFails: 'the-gradle-build-fails',
  mavenFails: 'the-maven-build-fails',
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

export function withoutTroubleshooting(message) {
  const link = troubleshootingLinkOf(message);
  return link === undefined ? message : message.replace(link, '').replace(/[.\s]+$/u, '');
}

export function troubleshootingSentence(anchor) {
  const url = troubleshootingUrl(anchor);
  return url === undefined ? undefined : `See ${url}`;
}

export function withTroubleshooting(message, anchor) {
  if (anchor === undefined || troubleshootingLinkOf(message) !== undefined) {
    return message;
  }
  const sentence = troubleshootingSentence(anchor);
  if (sentence === undefined) {
    return message;
  }
  if (message.includes('\n')) {
    return `${message.trimEnd()}\n${sentence}`;
  }
  return `${message.replace(/[.:]?\s*$/u, '')}. ${sentence}`;
}

export function toolErrorHelpLine(messages) {
  const url = troubleshootingUrl(TROUBLESHOOTING_ANCHORS.exitCode2);
  const unlinked = messages.some((message) => troubleshootingLinkOf(String(message)) === undefined);
  return unlinked && url !== undefined ? `Help with tool errors: ${url}` : undefined;
}

export function testsFailAnchor(snapshot) {
  return snapshot === 'base' ? TROUBLESHOOTING_ANCHORS.baseTestsFail : undefined;
}

export function troubleshootingError(message, anchor, options) {
  return new Error(withTroubleshooting(message, anchor), options);
}

export function explainedError(message, options) {
  return Object.defineProperty(new Error(message, options), 'explained', { value: true });
}

export function isExplainedError(error) {
  return error instanceof Error && error.explained === true;
}

export function failureText(error, anchor) {
  const message = error instanceof Error ? error.message : String(error);
  return isExplainedError(error) ? message : withTroubleshooting(message, anchor);
}
