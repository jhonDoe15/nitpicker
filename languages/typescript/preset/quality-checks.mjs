import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ARCHITECTURE_CONFIG, POLICY_TYPESCRIPT_CONFIG } from './dependency-graph/cruise.mjs';
import { resolveLayout } from './layout.mjs';
import { STRUCTURE_CHECK_FILES } from './structure/check-files.mjs';
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

const JAVASCRIPT_PRESET_FILE = 'languages/javascript/preset/javascript-preset.mjs';

const ESLINT_RULES_FOLDER = 'languages/typescript/preset/eslint-plugin/rules';

const POLICY_FILES = [
  'languages/typescript/preset/layout.mjs',
  'languages/typescript/preset/head-policy.mjs',
  JAVASCRIPT_PRESET_FILE,
  'languages/javascript/preset/jsdoc.mjs',
  'languages/javascript/preset/eslint-dialect.mjs',
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
];

function eslintPolicyFiles() {
  const rules = readdirSync(path.join(packageRoot, ESLINT_RULES_FOLDER), { recursive: true })
    .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
    .map((name) => `${ESLINT_RULES_FOLDER}/${name.split(path.sep).join('/')}`);
  return [...POLICY_FILES, ...rules];
}

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
        ...eslintPolicyFiles(),
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
      ...eslintPolicyFiles(),
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
      ARCHITECTURE_CONFIG,
      POLICY_TYPESCRIPT_CONFIG,
    ],
  };
}

function prettierPatterns(layout) {
  const code = layout.formatExtensions.join(',');
  return [
    ...layout.sourceRoots.map((root) => `${root}/**/*.{${code},json,yaml,yml}`),
    ...layout.testRoots.map((root) => `${root}/**/*.{${code},json}`),
    `*.{${code},json}`,
  ];
}

function prettierCheckFor(layout, exclusions) {
  return {
    name: 'prettier-format',
    kind: 'prettier',
    version: prettierVersion,
    patterns: prettierPatterns(layout),
    exclusions: exclusions.general,
    configRelativePath: 'languages/typescript/preset/defaults/.prettierrc.json',
    ignoreRelativePath: 'languages/typescript/preset/defaults/.prettierignore',
    shardWeight: 8,
    configurationFiles: [
      'languages/typescript/adapters/prettier-layers.mjs',
      'languages/typescript/preset/layout.mjs',
      'languages/typescript/preset/head-policy.mjs',
      JAVASCRIPT_PRESET_FILE,
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
        'languages/typescript/preset/tool-configs.mjs',
        JAVASCRIPT_PRESET_FILE,
        'languages/typescript/preset/defaults/tsconfig.quality.json',
      ],
    },
    {
      name: 'dependency-architecture',
      kind: 'architecture',
      version: dependencyCruiserVersion,
      patterns: layout.graphRoots,
      exclusions: [ARCHITECTURE_EXCLUSION, ...layout.exclude],
      configRelativePath: ARCHITECTURE_CONFIG,
      exclude: ARCHITECTURE_EXCLUSION,
      shardWeight: 7,
      configurationFiles: [
        'languages/typescript/preset/layout.mjs',
        'languages/typescript/preset/head-policy.mjs',
        ARCHITECTURE_CONFIG,
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
        ...eslintPolicyFiles(),
      ],
    },
  ];
}

const DEPENDENCY_GRAPH_FILES = [
  ARCHITECTURE_CONFIG,
  'languages/typescript/preset/dependency-graph/cruise.mjs',
  POLICY_TYPESCRIPT_CONFIG,
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
      configurationFiles: STRUCTURE_CHECK_FILES,
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
      configurationFiles: [
        'languages/typescript/preset/defaults/jscpd.json',
        'languages/typescript/preset/duplicates/normalize.mjs',
        'languages/typescript/preset/tool-configs.mjs',
        JAVASCRIPT_PRESET_FILE,
      ],
    },
    {
      name: 'dead-code',
      kind: 'dead-code',
      version: knipVersion,
      exclusions: exclusions.general,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 5,
      configurationFiles: [
        'languages/typescript/preset/defaults/knip.json',
        'languages/typescript/preset/tool-configs.mjs',
        JAVASCRIPT_PRESET_FILE,
      ],
    },
  ];
}

const CRAP_CONFIGURATION_FILES = [
  'languages/typescript/preset/defaults/crap.config.mjs',
  'languages/typescript/preset/crap/report.mjs',
  'languages/typescript/preset/crap/analyze.mjs',
  'languages/javascript/preset/crap-extensions-hook.mjs',
  'languages/typescript/preset/layout.mjs',
  'languages/typescript/preset/head-policy.mjs',
  JAVASCRIPT_PRESET_FILE,
  'shared/rules/crap.mjs',
];

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
      configurationFiles: [
        'languages/typescript/preset/defaults/vitest.quality.config.ts',
        'languages/typescript/preset/layout.mjs',
        'languages/typescript/preset/head-policy.mjs',
        JAVASCRIPT_PRESET_FILE,
      ],
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
      configurationFiles: CRAP_CONFIGURATION_FILES,
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
        'languages/typescript/preset/tool-configs.mjs',
        JAVASCRIPT_PRESET_FILE,
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
