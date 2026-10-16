import { EXCLUDED_PATH_PATTERN, resolveLayout } from './layout.mjs';
import { testExecutionChecksFor } from './checks/test-execution.mjs';
import {
  POLICY_FILES,
  JAVASCRIPT_PRESET_FILE,
  DEPENDENCY_GRAPH_FILES,
} from './checks/policy-files.mjs';
import { ARCHITECTURE_CONFIG, POLICY_TYPESCRIPT_CONFIG } from './dependency-graph/cruise.mjs';
import { MINUTE_MS, eslintVersion, vitestVersion } from './checks/constants.mjs';
import { COUPLING_CHECK_FILES } from './coupling/check-files.mjs';
import { STRUCTURE_CHECK_FILES } from './structure/check-files.mjs';

const dependencyCruiserVersion = 'unresolved';

const prettierVersion = 'unresolved';

const typeScriptVersion = 'unresolved';

const jscpdVersion = 'unresolved';

const knipVersion = 'unresolved';

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
    configRelativePath: `languages/typescript/preset/eslint-config/policies/${name}.config.mjs`,
    patterns: layout.sourceGlobs,
    exclusions: exclusions.production,
    policyFiles: [],
    shardWeight,
    configurationFiles: [
      'languages/typescript/preset/eslint-config/policies/base.mjs',
      `languages/typescript/preset/eslint-config/policies/${name}.config.mjs`,
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
      'languages/typescript/adapters/prettier/prettier-layers.mjs',
      'languages/typescript/conventions/prettier-conventions.mjs',
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
      exclusions: ['dist/**', ...layout.exclude],
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
      exclusions: [EXCLUDED_PATH_PATTERN, ...layout.exclude],
      configRelativePath: ARCHITECTURE_CONFIG,
      shardWeight: 7,
      configurationFiles: [
        'languages/typescript/preset/layout.mjs',
        'languages/typescript/preset/head-policy.mjs',
        ARCHITECTURE_CONFIG,
        'languages/typescript/preset/architecture/outside-roots/outside-roots.mjs',
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
        'languages/typescript/preset/eslint-config/policies/coding-standards.config.mjs',
        ...POLICY_FILES,
      ],
    },
  ];
}

function graphChecksFor(exclusions) {
  return [
    {
      name: 'coupling',
      kind: 'coupling',
      version: dependencyCruiserVersion,
      exclusions: exclusions.production,
      timeoutMs: 2 * MINUTE_MS,
      shardWeight: 7,
      configurationFiles: [...DEPENDENCY_GRAPH_FILES, ...COUPLING_CHECK_FILES],
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
        'languages/typescript/preset/layout.mjs',
        'languages/typescript/preset/head-policy.mjs',
        'languages/typescript/preset/eslint-config/scope-support.mjs',
        'languages/typescript/preset/unused-api/test-only/production-config.mjs',
        'languages/typescript/preset/unused-api/test-only/test-only-exports.mjs',
        'languages/typescript/preset/unused-api/workspace/packages.mjs',
        'languages/typescript/preset/unused-api/workspace/pnpm-workspace.mjs',
        'languages/typescript/adapters/quality-areas/runners/unused-api.mjs',
        'shared/policy.mjs',
        'shared/rules/exceptions.mjs',
        'shared/unused-api/unused-api-policy.mjs',
        JAVASCRIPT_PRESET_FILE,
      ],
    },
  ];
}

const defaultChecks = createQualityChecks();

export const { eslintChecks, entryPointsCheck, staticChecks, qualityAreaChecks } = defaultChecks;
