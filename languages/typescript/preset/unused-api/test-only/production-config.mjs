import path from 'node:path';
import { storyGlobs } from '../../eslint-config/scope-support.mjs';
import { globMatcher, toPosix } from '../../layout.mjs';

const TEST_RUNNER_CONFIG = /^vitest/u;
const TEST_RUNNER_PLUGINS = [
  'ava',
  'cucumber',
  'cypress',
  'jest',
  'karma',
  'mocha',
  'playwright',
  'playwright-ct',
  'playwright-test',
  'rstest',
  'vitest',
  'webdriver-io',
];

function isProductionEntry(pattern, layout) {
  const underTestRoot = layout.testRoots.some((root) => pattern.startsWith(`${root}/`));
  return !underTestRoot && !TEST_RUNNER_CONFIG.test(path.posix.basename(pattern));
}

function testAndStoryGlobs(layout) {
  return [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs, ...storyGlobs];
}

export function layoutProductionMatcher(layout) {
  const matchers = testAndStoryGlobs(layout).map((glob) => globMatcher(glob));
  return (relative) => !matchers.some((matcher) => matcher.test(toPosix(relative)));
}

/**
 * The knip config of the normal run without tests: test and story files leave the project, test
 * entries and test-runner plugins go, and everything else (scripts in `package.json`, tool configs
 * found by plugins, `bin` and `exports`) stays an entry as before.
 */
export function layoutKnipProductionConfig(config, layout) {
  const tests = testAndStoryGlobs(layout);
  return {
    ...config,
    ...Object.fromEntries(TEST_RUNNER_PLUGINS.map((plugin) => [plugin, false])),
    entry: config.entry.filter((pattern) => isProductionEntry(pattern, layout)),
    project: [...config.project, ...tests.map((glob) => `!${glob}`)],
  };
}

export function withEntryExports(config) {
  return { ...config, includeEntryExports: true };
}
