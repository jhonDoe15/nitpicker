import path from 'node:path';
import { storyGlobs } from '../../eslint-config/scope-support.mjs';
import { globToRegExp, toPosix } from '../../layout.mjs';

const TEST_RUNNER_CONFIG = /^(?:vitest|jest|\.mocharc)/u;
const TEST_RUNNER_CONFIG_GLOBS = [
  '**/jest*.config.*',
  '**/vitest*.config.*',
  '**/vitest.workspace.*',
  '**/.mocharc.*',
];
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

const NODE_PRODUCTION_ENTRIES = ['server.js'];

function isProductionEntry(pattern, layout) {
  const underTestRoot = layout.testRoots.some((root) => pattern.startsWith(`${root}/`));
  return !underTestRoot && !TEST_RUNNER_CONFIG.test(path.posix.basename(pattern));
}

function testAndStoryGlobs(layout) {
  return [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs, ...storyGlobs];
}

export function layoutProductionMatcher(layout) {
  const matchers = testAndStoryGlobs(layout).map((glob) => globToRegExp(glob));
  return (relative) => !matchers.some((matcher) => matcher.test(toPosix(relative)));
}

/**
 * The knip config of the normal run without tests: test and story files leave the project, test
 * entries and test-runner plugins go (the Node.js plugin too, whose `node --test` patterns are
 * entries, keeping its production `server.js`), and everything else (scripts in `package.json`, tool configs
 * found by plugins, `bin` and `exports`) stays an entry as before.
 */
export function layoutKnipProductionConfig(config, layout) {
  const tests = [...testAndStoryGlobs(layout), ...TEST_RUNNER_CONFIG_GLOBS];
  return {
    ...config,
    ...Object.fromEntries(TEST_RUNNER_PLUGINS.map((plugin) => [plugin, false])),
    node: false,
    entry: [
      ...config.entry.filter((pattern) => isProductionEntry(pattern, layout)),
      ...NODE_PRODUCTION_ENTRIES,
    ],
    project: [...config.project, ...tests.map((glob) => `!${glob}`)],
  };
}

export function withEntryExports(config) {
  return { ...config, includeEntryExports: true };
}
