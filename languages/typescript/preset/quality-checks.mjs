import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { POLICY_TYPESCRIPT_CONFIG } from './dependency-graph/cruise.mjs';
import { resolveLayout } from './layout.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../shared/policy.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const MINUTE_MS = 60 * 1000;

export function parsePositiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`${name} must be a positive number`);
  }
  return number;
}

export const eslintVersion = 'unresolved';
export const dependencyCruiserVersion = 'unresolved';
export const prettierVersion = 'unresolved';
export const typeScriptVersion = 'unresolved';
export const vitestVersion = 'unresolved';
export const jscpdVersion = 'unresolved';
export const knipVersion = 'unresolved';
export const crapVersion = 'unresolved';
export const strykerVersion = 'unresolved';

const POLICY_FILES = [
  'languages/typescript/preset/layout.mjs',
  'languages/typescript/preset/head-policy.mjs',
  'languages/typescript/preset/eslint-config/exceptions.mjs',
  'languages/typescript/preset/eslint-config/error-wrapping-policy.mjs',
  'languages/typescript/preset/eslint-config/strict.mjs',
  'languages/typescript/preset/eslint-config/strict-adapters.mjs',
  'languages/typescript/preset/eslint-config/strict-declarations.mjs',
  'languages/typescript/preset/eslint-config/strict-domain.mjs',
  'languages/typescript/preset/eslint-config/strict-escape-hatches.mjs',
  'languages/typescript/preset/eslint-config/strict-tests.mjs',
  'languages/typescript/preset/eslint-config/react-plugins.mjs',
  'languages/typescript/preset/eslint-config/react-rules.mjs',
  'languages/typescript/preset/eslint-config/react-scope.mjs',
  'languages/typescript/preset/eslint-config/rule-hints.mjs',
  'languages/typescript/preset/eslint-plugin/index.mjs',
  'languages/typescript/preset/eslint-plugin/rules/ancestry.mjs',
  'languages/typescript/preset/eslint-plugin/rules/composition-root-files.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-branch-in-composition-root.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-comments.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-handwritten-boundary-guard.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-self-recursion.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-throw.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-unknown-in-domain.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-unvalidated-schema-field.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-wait-for-with-fake-timers.mjs',
  'languages/typescript/preset/eslint-plugin/rules/container-pause-requires-finally-unpause.mjs',
  'languages/typescript/preset/eslint-plugin/rules/bounded-container-teardown.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-fixed-sleep-synchronization.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-interval-polling-in-tests.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-internal-module-mocks.mjs',
  'languages/typescript/preset/eslint-plugin/rules/preserve-error-cause.mjs',
  'languages/typescript/preset/eslint-plugin/rules/react-effects.mjs',
  'languages/typescript/preset/eslint-plugin/rules/react-no-effect-data-fetching.mjs',
  'languages/typescript/preset/eslint-plugin/rules/react-no-effect-derived-state.mjs',
  'languages/typescript/preset/eslint-plugin/rules/react-single-styling-approach.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-external-executables-in-unit-tests.mjs',
  'languages/typescript/preset/eslint-plugin/rules/integration-test-uses-approved-harness.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-managed-resource-construction-outside-composition-roots.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-mocking-subject-under-test.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-module-level-let.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-production-console.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-silent-catch.mjs',
  'languages/typescript/preset/eslint-plugin/rules/report-module-load-effects.mjs',
  'languages/typescript/preset/eslint-plugin/rules/structured-catch-logging.mjs',
  'languages/typescript/preset/eslint-plugin/rules/test-must-use-production-runtime.mjs',
  'languages/typescript/preset/eslint-plugin/rules/test-code-analysis.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-git-repository-per-test.mjs',
  'languages/typescript/preset/eslint-plugin/rules/hermetic-git-in-tests.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-node-process-per-test.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-server-or-worker-per-test.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-raised-test-timeout.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-first-test-charged-setup.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-uninjectable-delay.mjs',
  'languages/typescript/preset/eslint-plugin/rules/no-process-globals-outside-main-guard.mjs',
  'languages/typescript/preset/eslint-plugin/rules/test-tsconfig-pins-lib-and-types.mjs',
];

const ARCHITECTURE_EXCLUSION =
  '(^|/)(node_modules|dist|build|generated|coverage|reports|target)(/|$)';

export function createQualityChecks(layout = resolveLayout()) {
  const exclusions = checkExclusions(layout);
  return {
    generalExclusions: exclusions.general,
    productionExclusions: exclusions.production,
    eslintChecks: eslintChecksFor(layout, exclusions),
    entryPointsCheck: entryPointsCheckFor(layout, exclusions),
    staticChecks: [prettierCheckFor(layout, exclusions), ...typeAndArchitectureChecksFor(layout)],
    qualityAreaChecks: [
      ...standardsChecksFor(exclusions),
      ...graphChecksFor(exclusions),
      ...repositoryChecksFor(exclusions),
      ...testExecutionChecksFor(exclusions),
    ],
  };
}

function checkExclusions(layout) {
  return {
    general: [...layout.excludedGlobs, '.stryker-tmp/**'],
    production: [
      ...layout.excludedGlobs,
      ...layout.sourceTestDirectoryGlobs,
      ...layout.testGlobs,
      '.stryker-tmp/**',
    ],
  };
}

function eslintChecksFor(layout, exclusions) {
  return [
    {
      name: 'eslint-lint',
      configRelativePath: 'languages/typescript/preset/defaults/eslint.config.mjs',
      patterns: [...layout.sourceGlobs, ...layout.testGlobs],
      exclusions: exclusions.general,
      policyFiles: ['languages/typescript/preset/defaults/tsconfig.quality.json'],
      shardWeight: 25,
      configurationFiles: [
        'languages/typescript/preset/defaults/eslint.config.mjs',
        'languages/typescript/preset/defaults/tsconfig.quality.json',
        ...POLICY_FILES,
      ],
    },
    productionEslintCheck(layout, exclusions, { name: 'errors', shardWeight: 9 }),
    productionEslintCheck(layout, exclusions, { name: 'logging', shardWeight: 9 }),
    productionEslintCheck(layout, exclusions, { name: 'module-effects', shardWeight: 11 }),
  ];
}

function productionEslintCheck(layout, exclusions, { name, shardWeight }) {
  return {
    name: `eslint-${name}`,
    configRelativePath: `languages/typescript/preset/eslint-config/${name}.mjs`,
    patterns: layout.sourceGlobs,
    exclusions: exclusions.production,
    policyFiles: [],
    shardWeight,
    configurationFiles: [
      'languages/typescript/preset/eslint-config/base.mjs',
      `languages/typescript/preset/eslint-config/${name}.mjs`,
      ...POLICY_FILES,
    ],
  };
}

function entryPointsCheckFor(layout, exclusions) {
  return {
    name: 'entry-points',
    sourceRoot: layout.sourceRoot,
    sourceRoots: layout.sourceRoots,
    exclusions: exclusions.production,
    version: dependencyCruiserVersion,
    shardWeight: 7,
    logicalFiles: [
      'languages/typescript/preset/layout.mjs',
      'languages/typescript/preset/head-policy.mjs',
      'languages/typescript/preset/entry-points/analyze.mjs',
      'languages/typescript/preset/dependency-graph/cruise.mjs',
      'languages/typescript/preset/dependency-graph/config.mjs',
      POLICY_TYPESCRIPT_CONFIG,
      'core/tooling/policy-links.mjs',
      'core/tooling/temporary-files.mjs',
    ],
  };
}

function prettierCheckFor(layout, exclusions) {
  return {
    name: 'prettier-format',
    kind: 'prettier',
    version: prettierVersion,
    patterns: [
      ...layout.sourceRoots.map((root) => `${root}/**/*.{ts,tsx,mts,mjs,json,yaml,yml}`),
      ...layout.testRoots.map((root) => `${root}/**/*.{ts,tsx,mts,mjs,json}`),
      '*.{ts,tsx,mts,mjs,json}',
    ],
    exclusions: exclusions.general,
    configRelativePath: 'languages/typescript/preset/defaults/.prettierrc.json',
    ignoreRelativePath: 'languages/typescript/preset/defaults/.prettierignore',
    shardWeight: 8,
    configurationFiles: [
      'languages/typescript/adapters/prettier-layers.mjs',
      'languages/typescript/preset/layout.mjs',
      'languages/typescript/preset/head-policy.mjs',
      'languages/typescript/preset/defaults/.prettierrc.json',
      'languages/typescript/preset/defaults/.prettierignore',
    ],
  };
}

function typeAndArchitectureChecksFor(layout) {
  return [
    {
      name: 'typescript-typecheck',
      kind: 'typecheck',
      version: typeScriptVersion,
      patterns: [],
      exclusions: ['**/dist/**', '**/*.d.ts', ...layout.exclude],
      configRelativePath: 'languages/typescript/preset/defaults/tsconfig.quality.json',
      shardWeight: 9,
      configurationFiles: [
        'languages/typescript/preset/layout.mjs',
        'languages/typescript/preset/head-policy.mjs',
        'languages/typescript/preset/defaults/tsconfig.quality.json',
      ],
    },
    {
      name: 'dependency-architecture',
      kind: 'architecture',
      version: dependencyCruiserVersion,
      patterns: layout.graphRoots,
      exclusions: [ARCHITECTURE_EXCLUSION, ...layout.exclude],
      configRelativePath: 'languages/typescript/preset/defaults/dependency-cruiser.config.mjs',
      exclude: [ARCHITECTURE_EXCLUSION, layout.excludePattern]
        .filter((pattern) => pattern !== undefined)
        .join('|'),
      shardWeight: 7,
      configurationFiles: [
        'languages/typescript/preset/layout.mjs',
        'languages/typescript/preset/head-policy.mjs',
        'languages/typescript/preset/defaults/dependency-cruiser.config.mjs',
        'languages/typescript/preset/architecture/strict-boundary-rules.mjs',
        'languages/typescript/preset/architecture/strict-layout.mjs',
        'languages/typescript/preset/defaults/tsconfig.quality.json',
      ],
    },
  ];
}

function standardsChecksFor(exclusions) {
  return [
    {
      name: 'policy-tests',
      kind: 'policy-tests',
      version: vitestVersion,
      exclusions: exclusions.general,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 21,
      configurationFiles: ['vitest.config.mts'],
    },
    {
      name: 'coding-standards',
      kind: 'coding-standards',
      version: eslintVersion,
      exclusions: exclusions.general,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 10,
      configurationFiles: [
        'languages/typescript/preset/coding-standards/check.mjs',
        'languages/typescript/preset/eslint-config/coding-standards.mjs',
        ...POLICY_FILES,
      ],
    },
  ];
}

const DEPENDENCY_GRAPH_FILES = [
  'languages/typescript/preset/dependency-graph/config.mjs',
  'languages/typescript/preset/dependency-graph/cruise.mjs',
  POLICY_TYPESCRIPT_CONFIG,
  'core/tooling/policy-links.mjs',
  'core/tooling/temporary-files.mjs',
];

function graphChecksFor(exclusions) {
  return [
    {
      name: 'coupling',
      kind: 'coupling',
      version: dependencyCruiserVersion,
      exclusions: exclusions.production,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 7,
      configurationFiles: [
        ...DEPENDENCY_GRAPH_FILES,
        'languages/typescript/preset/coupling/analyze.mjs',
        'shared/rules/coupling.mjs',
      ],
    },
    {
      name: 'test-runtime',
      kind: 'test-runtime',
      version: dependencyCruiserVersion,
      exclusions: exclusions.general,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 9,
      configurationFiles: [
        ...DEPENDENCY_GRAPH_FILES,
        'languages/typescript/preset/test-runtime/analyze.mjs',
      ],
    },
    {
      name: 'structure',
      kind: 'structure',
      version: typeScriptVersion,
      exclusions: exclusions.production,
      timeoutMs: MINUTE_MS,
      shardWeight: 4,
      configurationFiles: [
        'languages/typescript/preset/layout.mjs',
        'languages/typescript/preset/head-policy.mjs',
        'languages/typescript/preset/dependency-graph/cruise.mjs',
        'languages/typescript/preset/structure/analyze.mjs',
      ],
    },
  ];
}

function repositoryChecksFor(exclusions) {
  return [
    {
      name: 'duplicates',
      kind: 'duplicates',
      version: jscpdVersion,
      exclusions: exclusions.general,
      timeoutMs: MINUTE_MS,
      shardWeight: 2,
      configurationFiles: ['languages/typescript/preset/defaults/jscpd.json'],
    },
    {
      name: 'dead-code',
      kind: 'dead-code',
      version: knipVersion,
      exclusions: exclusions.general,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 5,
      configurationFiles: ['languages/typescript/preset/defaults/knip.json'],
    },
  ];
}

function testExecutionChecksFor(exclusions) {
  return [
    {
      name: 'coverage',
      kind: 'coverage',
      version: vitestVersion,
      exclusions: exclusions.general,
      concurrencyWeight: 2,
      concurrencyGroup: 'test-execution',
      executionPriority: 1,
      shardWeight: 16,
      timeoutMs: 5 * MINUTE_MS,
      configurationFiles: ['languages/typescript/preset/defaults/vitest.quality.config.ts'],
    },
    {
      name: 'crap',
      kind: 'crap',
      version: crapVersion,
      exclusions: exclusions.production,
      dependencies: ['coverage'],
      shardWeight: 2,
      timeoutMs: 2 * MINUTE_MS,
      adapterArguments: ['--crap-score-limit', String(DEFAULT_CRAP_SCORE_LIMIT)],
      configurationFiles: [
        'languages/typescript/preset/defaults/crap.config.mjs',
        'languages/typescript/preset/crap/report.mjs',
        'languages/typescript/preset/crap/analyze.mjs',
        'shared/rules/crap.mjs',
      ],
    },
    {
      name: 'mutation',
      kind: 'mutation',
      version: strykerVersion,
      exclusions: exclusions.production,
      concurrencyWeight: 2,
      concurrencyGroup: 'test-execution',
      executionPriority: 1,
      shardWeight: 90,
      timeoutMs: 30 * MINUTE_MS,
      configurationFiles: [
        'languages/typescript/preset/defaults/stryker.config.mjs',
        'languages/typescript/preset/defaults/vitest.quality.config.ts',
        'languages/typescript/preset/defaults/tsconfig.stryker.json',
      ],
    },
  ];
}

const defaultChecks = createQualityChecks();
export const {
  generalExclusions,
  productionExclusions,
  eslintChecks,
  entryPointsCheck,
  staticChecks,
  qualityAreaChecks,
} = defaultChecks;

export function hashFiles(relativePaths, configurationValues = []) {
  const hash = createHash('sha256');
  for (const relativePath of [...new Set(relativePaths)].sort()) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(readFileSync(path.join(packageRoot, relativePath)));
    hash.update('\0');
  }
  for (const configurationValue of [...new Set(configurationValues)].sort()) {
    hash.update(configurationValue);
    hash.update('\0');
  }
  return hash.digest('hex');
}
