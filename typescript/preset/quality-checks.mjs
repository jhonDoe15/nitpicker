import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { POLICY_TYPESCRIPT_CONFIG } from './dependency-graph/cruise.mjs';
import { resolveLayout } from './layout.mjs';

const packageRoot = path.resolve(import.meta.dirname, '..');
const MINUTE_MS = 60 * 1000;
export const DEFAULT_CRAP_SCORE_LIMIT = 9;

export function parsePositiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`${name} must be a positive number`);
  }
  return number;
}

// Versions are resolved only for selected analyzers, against the binaries that will run.
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
  'preset/layout.mjs',
  'preset/head-policy.mjs',
  'preset/eslint-config/exceptions.mjs',
  'preset/eslint-config/error-wrapping-policy.mjs',
  'preset/eslint-config/strict.mjs',
  'preset/eslint-config/strict-adapters.mjs',
  'preset/eslint-config/strict-declarations.mjs',
  'preset/eslint-config/strict-domain.mjs',
  'preset/eslint-config/strict-escape-hatches.mjs',
  'preset/eslint-config/strict-tests.mjs',
  'preset/eslint-plugin/index.mjs',
  'preset/eslint-plugin/rules/no-comments.mjs',
  'preset/eslint-plugin/rules/no-handwritten-boundary-guard.mjs',
  'preset/eslint-plugin/rules/no-self-recursion.mjs',
  'preset/eslint-plugin/rules/no-throw.mjs',
  'preset/eslint-plugin/rules/no-wait-for-with-fake-timers.mjs',
  'preset/eslint-plugin/rules/container-pause-requires-finally-unpause.mjs',
  'preset/eslint-plugin/rules/bounded-container-teardown.mjs',
  'preset/eslint-plugin/rules/no-fixed-sleep-synchronization.mjs',
  'preset/eslint-plugin/rules/no-interval-polling-in-tests.mjs',
  'preset/eslint-plugin/rules/no-internal-module-mocks.mjs',
  'preset/eslint-plugin/rules/preserve-error-cause.mjs',
  'preset/eslint-plugin/rules/no-external-executables-in-unit-tests.mjs',
  'preset/eslint-plugin/rules/integration-test-uses-approved-harness.mjs',
  'preset/eslint-plugin/rules/no-managed-resource-construction-outside-composition-roots.mjs',
  'preset/eslint-plugin/rules/no-mocking-subject-under-test.mjs',
  'preset/eslint-plugin/rules/no-module-level-let.mjs',
  'preset/eslint-plugin/rules/no-production-console.mjs',
  'preset/eslint-plugin/rules/no-silent-catch.mjs',
  'preset/eslint-plugin/rules/report-module-load-effects.mjs',
  'preset/eslint-plugin/rules/structured-catch-logging.mjs',
  'preset/eslint-plugin/rules/test-must-use-production-runtime.mjs',
  'preset/eslint-plugin/rules/test-code-analysis.mjs',
  'preset/eslint-plugin/rules/no-git-repository-per-test.mjs',
  'preset/eslint-plugin/rules/hermetic-git-in-tests.mjs',
  'preset/eslint-plugin/rules/no-node-process-per-test.mjs',
  'preset/eslint-plugin/rules/no-server-or-worker-per-test.mjs',
  'preset/eslint-plugin/rules/no-raised-test-timeout.mjs',
  'preset/eslint-plugin/rules/no-process-globals-outside-main-guard.mjs',
  'preset/eslint-plugin/rules/test-tsconfig-pins-lib-and-types.mjs',
];

const ARCHITECTURE_EXCLUSION =
  '(^|/)(node_modules|dist|build|generated|coverage|reports|target)(/|$)';

/**
 * Builds every check definition for one layout. The exported constants below are the default
 * layout; the CLI rebuilds the layout-dependent analyzers when the config file changes it.
 */
export function createQualityChecks(layout = resolveLayout()) {
  const generalExclusions = [...layout.excludedGlobs, '.stryker-tmp/**'];
  const productionExclusions = [
    ...layout.excludedGlobs,
    ...layout.sourceTestDirectoryGlobs,
    ...layout.testGlobs,
    '.stryker-tmp/**',
  ];
  const architectureExclusion = [ARCHITECTURE_EXCLUSION, layout.excludePattern]
    .filter((pattern) => pattern !== undefined)
    .join('|');

  /**
   * The checks every quality dial (differential and snapshot) must agree exist. Each entry
   * describes *what* to check; `configurationFiles` covers only the logical policy (the ESLint
   * config plus the rules and shared policy it loads), never a dial's adapter implementation.
   * Each dial hashes its own adapter files on top of this list, so a change to how a dial invokes
   * ESLint invalidates only that dial's comparison baseline, not the other dial's.
   *
   * `shardWeight` is relative wall time for CI sharding. The numbers come from measurements
   * (`scripts/measure-shard-weights.mjs`); see docs/shard-weights.md before changing them.
   */
  const eslintChecks = [
    {
      name: 'eslint-lint',
      configRelativePath: 'preset/defaults/eslint.config.mjs',
      patterns: [...layout.sourceGlobs, ...layout.testGlobs],
      exclusions: generalExclusions,
      policyFiles: ['preset/defaults/tsconfig.quality.json'],
      shardWeight: 25,
      configurationFiles: [
        'preset/defaults/eslint.config.mjs',
        'preset/defaults/tsconfig.quality.json',
        ...POLICY_FILES,
      ],
    },
    {
      name: 'eslint-errors',
      configRelativePath: 'preset/eslint-config/errors.mjs',
      patterns: layout.sourceGlobs,
      exclusions: productionExclusions,
      policyFiles: [],
      shardWeight: 9,
      configurationFiles: [
        'preset/eslint-config/base.mjs',
        'preset/eslint-config/errors.mjs',
        ...POLICY_FILES,
      ],
    },
    {
      name: 'eslint-logging',
      configRelativePath: 'preset/eslint-config/logging.mjs',
      patterns: layout.sourceGlobs,
      exclusions: productionExclusions,
      policyFiles: [],
      shardWeight: 9,
      configurationFiles: [
        'preset/eslint-config/base.mjs',
        'preset/eslint-config/logging.mjs',
        ...POLICY_FILES,
      ],
    },
    {
      name: 'eslint-module-effects',
      configRelativePath: 'preset/eslint-config/module-effects.mjs',
      patterns: layout.sourceGlobs,
      exclusions: productionExclusions,
      policyFiles: [],
      shardWeight: 11,
      configurationFiles: [
        'preset/eslint-config/base.mjs',
        'preset/eslint-config/module-effects.mjs',
        ...POLICY_FILES,
      ],
    },
  ];

  const entryPointsCheck = {
    name: 'entry-points',
    sourceRoot: layout.sourceRoot,
    sourceRoots: layout.sourceRoots,
    exclusions: productionExclusions,
    version: dependencyCruiserVersion,
    shardWeight: 7,
    logicalFiles: [
      'preset/layout.mjs',
      'preset/head-policy.mjs',
      'preset/entry-points/analyze.mjs',
      'preset/dependency-graph/cruise.mjs',
      'preset/dependency-graph/config.mjs',
      POLICY_TYPESCRIPT_CONFIG,
      'adapters/policy-links.mjs',
      'adapters/temporary-files.mjs',
    ],
  };

  const staticChecks = [
    {
      name: 'prettier-format',
      kind: 'prettier',
      version: prettierVersion,
      patterns: [
        ...layout.sourceRoots.map((root) => `${root}/**/*.{ts,mts,mjs,json,yaml,yml}`),
        ...layout.testRoots.map((root) => `${root}/**/*.{ts,mts,mjs,json}`),
        '*.{ts,mts,mjs,json}',
      ],
      exclusions: generalExclusions,
      configRelativePath: 'preset/defaults/.prettierrc.json',
      ignoreRelativePath: 'preset/defaults/.prettierignore',
      shardWeight: 8,
      configurationFiles: [
        'preset/layout.mjs',
        'preset/head-policy.mjs',
        'preset/defaults/.prettierrc.json',
        'preset/defaults/.prettierignore',
      ],
    },
    {
      name: 'typescript-typecheck',
      kind: 'typecheck',
      version: typeScriptVersion,
      patterns: [],
      exclusions: ['**/dist/**', '**/*.d.ts', ...layout.exclude],
      configRelativePath: 'preset/defaults/tsconfig.quality.json',
      shardWeight: 9,
      configurationFiles: [
        'preset/layout.mjs',
        'preset/head-policy.mjs',
        'preset/defaults/tsconfig.quality.json',
      ],
    },
    {
      name: 'dependency-architecture',
      kind: 'architecture',
      version: dependencyCruiserVersion,
      patterns: layout.graphRoots,
      exclusions: [ARCHITECTURE_EXCLUSION, ...layout.exclude],
      configRelativePath: 'preset/defaults/dependency-cruiser.config.mjs',
      exclude: architectureExclusion,
      shardWeight: 7,
      configurationFiles: [
        'preset/layout.mjs',
        'preset/head-policy.mjs',
        'preset/defaults/dependency-cruiser.config.mjs',
        'preset/architecture/strict-boundary-rules.mjs',
        'preset/architecture/strict-layout.mjs',
        'preset/defaults/tsconfig.quality.json',
      ],
    },
  ];

  const qualityAreaChecks = [
    {
      name: 'policy-tests',
      kind: 'policy-tests',
      version: vitestVersion,
      exclusions: generalExclusions,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 21,
      configurationFiles: ['vitest.config.mts'],
    },
    {
      name: 'coding-standards',
      kind: 'coding-standards',
      version: eslintVersion,
      exclusions: generalExclusions,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 10,
      configurationFiles: [
        'preset/coding-standards/check.mjs',
        'preset/eslint-config/coding-standards.mjs',
        ...POLICY_FILES,
      ],
    },
    {
      name: 'coupling',
      kind: 'coupling',
      version: dependencyCruiserVersion,
      exclusions: productionExclusions,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 7,
      configurationFiles: [
        'preset/dependency-graph/config.mjs',
        'preset/dependency-graph/cruise.mjs',
        POLICY_TYPESCRIPT_CONFIG,
        'adapters/policy-links.mjs',
        'adapters/temporary-files.mjs',
        'preset/coupling/analyze.mjs',
      ],
    },
    {
      name: 'test-runtime',
      kind: 'test-runtime',
      version: dependencyCruiserVersion,
      exclusions: generalExclusions,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 9,
      configurationFiles: [
        'preset/dependency-graph/config.mjs',
        'preset/dependency-graph/cruise.mjs',
        POLICY_TYPESCRIPT_CONFIG,
        'adapters/policy-links.mjs',
        'adapters/temporary-files.mjs',
        'preset/test-runtime/analyze.mjs',
      ],
    },
    {
      name: 'structure',
      kind: 'structure',
      version: typeScriptVersion,
      exclusions: productionExclusions,
      timeoutMs: MINUTE_MS,
      shardWeight: 4,
      configurationFiles: [
        'preset/layout.mjs',
        'preset/head-policy.mjs',
        'preset/dependency-graph/cruise.mjs',
        'preset/structure/analyze.mjs',
      ],
    },
    {
      name: 'duplicates',
      kind: 'duplicates',
      version: jscpdVersion,
      exclusions: productionExclusions,
      timeoutMs: MINUTE_MS,
      shardWeight: 2,
      configurationFiles: ['preset/defaults/jscpd.json'],
    },
    {
      name: 'dead-code',
      kind: 'dead-code',
      version: knipVersion,
      exclusions: generalExclusions,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 5,
      configurationFiles: ['preset/defaults/knip.json'],
    },
    {
      name: 'coverage',
      kind: 'coverage',
      version: vitestVersion,
      exclusions: generalExclusions,
      concurrencyWeight: 2,
      concurrencyGroup: 'test-execution',
      executionPriority: 1,
      shardWeight: 16,
      timeoutMs: 5 * MINUTE_MS,
      configurationFiles: ['preset/defaults/vitest.quality.config.ts'],
    },
    {
      name: 'crap',
      kind: 'crap',
      version: crapVersion,
      exclusions: productionExclusions,
      dependencies: ['coverage'],
      shardWeight: 2,
      timeoutMs: 2 * MINUTE_MS,
      adapterArguments: ['--crap-score-limit', String(DEFAULT_CRAP_SCORE_LIMIT)],
      configurationFiles: ['preset/defaults/crap.config.mjs', 'preset/crap/report.mjs'],
    },
    {
      name: 'mutation',
      kind: 'mutation',
      version: strykerVersion,
      exclusions: productionExclusions,
      concurrencyWeight: 2,
      concurrencyGroup: 'test-execution',
      executionPriority: 1,
      shardWeight: 90,
      timeoutMs: 30 * MINUTE_MS,
      configurationFiles: [
        'preset/defaults/stryker.config.mjs',
        'preset/defaults/stryker.vitest.config.ts',
        'preset/defaults/tsconfig.stryker.json',
      ],
    },
  ];

  return {
    generalExclusions,
    productionExclusions,
    eslintChecks,
    entryPointsCheck,
    staticChecks,
    qualityAreaChecks,
  };
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
