import path from 'node:path';
import { storyGlobs } from '../../eslint-config/scope-support.mjs';
import { fieldsOf, textsOf } from '../../../../../shared/values/readers.mts';
import { type ProductionLayout, globMatcher, toPosix } from './typed/layout-views.mts';
import type { KnipConfig } from './typed/knip-types.mts';

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

function isProductionEntry(pattern: string, layout: ProductionLayout): boolean {
  const underTestRoot = layout.testRoots.some((root) => pattern.startsWith(`${root}/`));
  return !(underTestRoot || TEST_RUNNER_CONFIG.test(path.posix.basename(pattern)));
}

function testAndStoryGlobs(layout: ProductionLayout): string[] {
  return [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs, ...storyGlobs];
}

export function layoutProductionMatcher(layout: ProductionLayout): (relative: string) => boolean {
  const matchers = testAndStoryGlobs(layout).map((glob) => globMatcher(glob));
  return (relative) => !matchers.some((matcher) => matcher.test(toPosix(relative)));
}

function productionWorkspace(
  workspace: unknown,
  { layout, tests }: { layout: ProductionLayout; tests: readonly string[] },
): KnipConfig {
  const kept = Object.entries(fieldsOf(workspace)).filter(
    ([key]) => !TEST_RUNNER_PLUGINS.includes(key),
  );
  const config = Object.fromEntries(kept);
  return {
    ...config,
    ...(config['entry'] === undefined
      ? {}
      : {
          entry: textsOf([config['entry']].flat()).filter((pattern) =>
            isProductionEntry(pattern, layout),
          ),
        }),
    ...(config['project'] === undefined
      ? {}
      : { project: [...textsOf([config['project']].flat()), ...tests.map((glob) => `!${glob}`)] }),
  };
}

export function layoutKnipProductionConfig(
  config: KnipConfig,
  layout: ProductionLayout,
): KnipConfig {
  const tests = [...testAndStoryGlobs(layout), ...TEST_RUNNER_CONFIG_GLOBS];
  const workspaces = Object.entries(fieldsOf(config['workspaces'])).map(([name, workspace]) => [
    name,
    productionWorkspace(workspace, { layout, tests }),
  ]);
  return {
    ...config,
    ...Object.fromEntries(TEST_RUNNER_PLUGINS.map((plugin) => [plugin, false])),
    node: false,
    entry: [
      ...textsOf(config['entry']).filter((pattern) => isProductionEntry(pattern, layout)),
      ...NODE_PRODUCTION_ENTRIES,
    ],
    project: [...textsOf(config['project']), ...tests.map((glob) => `!${glob}`)],
    ...(workspaces.length === 0 ? {} : { workspaces: Object.fromEntries(workspaces) }),
  };
}

export function withEntryExports(config: KnipConfig): KnipConfig {
  return { ...config, includeEntryExports: true };
}
