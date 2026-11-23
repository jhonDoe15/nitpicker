import type { QualityCheck, QualityChecks } from '../checks/typed/check-types.mts';
import type { HeadPolicyFile } from '../typed/head-policy-types.mts';
import type { ResolvedLayout } from '../typed/layout-types.mts';
import type { AnalyzerBody, PackageAnalyzer } from './typed/analyzer-types.mts';
import { DEFAULT_LEGACY_INVENTORY } from '../../../../shared/legacy-inventory.mts';
import { resolveAnalyzerVersion, testRunnerAnalyzerVersion } from '../analyzer-versions.mts';
import {
  createEntryPointAnalyzer,
  createEslintAnalyzer,
  createQualityAreaAnalyzer,
  createStaticCheckAnalyzer,
} from './typed/analyzer-factories.mts';
import {
  codeExtensionNames,
  resolveLayout,
  resolveLayoutFor,
  stylesheetExtensionNames,
} from '../layout.mts';
import { createQualityChecks } from '../quality-checks.mts';
import { eslintVersion } from '../checks/constants.mts';
import { hashFiles } from '../checks/hash.mts';
import { EXECUTION_INPUTS } from '../../../../shared/input-sets/inputs.mts';
import { withSizeScales } from './memory-scales.mts';
import { sourceInputs, withLegacyInventory } from './typed/shared-views.mts';

const QUALITY_CHECKS_FILE = 'languages/typescript/preset/quality-checks.mjs';
const TEST_RUNNER_ANALYZERS = new Set(['coverage', 'mutation', 'test-console']);
const EXECUTION_ANALYZERS = new Set([...TEST_RUNNER_ANALYZERS, 'test-runtime', 'crap']);
const ANALYZER_RUNTIME_FILES = [
  'core/diff/execution/analyzer-scheduler.mjs',
  'core/diff/execution/run-analyzers.mjs',
  'languages/typescript/preset/syntax/children.mjs',
  'shared/filesystem.mjs',
];
const ESLINT_ADAPTER_FILES = [
  QUALITY_CHECKS_FILE,
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/eslint/analyzer.mjs',
  'languages/typescript/adapters/eslint/chains/any-chain.mjs',
  'languages/typescript/adapters/eslint-runner.mjs',
  'languages/typescript/adapters/eslint-wrapper.config.mjs',
  'languages/typescript/adapters/lint-engine/overlapping-reports.mjs',
  'languages/typescript/adapters/oxlint/native/accumulating-spread-check.mjs',
  'languages/typescript/adapters/oxlint/native/owned-native-rules.mjs',
  'languages/typescript/adapters/lint-engine/lint-engine.mjs',
  'languages/typescript/adapters/lint-engine/project-layer.mjs',
  'languages/typescript/adapters/lint-engine/project-loader.mjs',
  'languages/typescript/adapters/lint-engine/project-rules.mjs',
  'languages/typescript/preset/eslint-config/exceptions.mjs',
  'languages/typescript/preset/eslint-project/config-paths.mjs',
  'languages/typescript/preset/eslint-project/project-config.mjs',
  'shared/conventions/tool-precedence.mjs',
  'languages/typescript/adapters/oxlint/oxlint-bridge.mjs',
  'languages/typescript/adapters/oxlint/oxlint-diagnostics.mjs',
  'languages/typescript/adapters/oxlint/oxlint-plan.mjs',
];
const ENTRY_POINT_ADAPTER_FILES = [
  QUALITY_CHECKS_FILE,
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/entry-points-runner.mjs',
];
const STATIC_CHECK_ADAPTER_FILES = [
  QUALITY_CHECKS_FILE,
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/static-checks/analyzer.mjs',
  'languages/typescript/adapters/static-checks-runner.mjs',
];
const QUALITY_AREA_ADAPTER_FILES = [
  QUALITY_CHECKS_FILE,
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/quality-areas/analyzer.mjs',
  'languages/typescript/adapters/quality-areas-runner.mjs',
];

function keyedBy(
  files: readonly string[],
  configurationValues: readonly string[] | undefined,
  create: (configurationHash: string) => AnalyzerBody,
): PackageAnalyzer {
  return {
    ...create(hashFiles(files, configurationValues)),
    cacheKeyFiles: files,
  };
}

function createEslintCheckAnalyzer(check: QualityChecks['eslintChecks'][number]): PackageAnalyzer {
  return keyedBy([...ESLINT_ADAPTER_FILES, ...check.configurationFiles], [], (configurationHash) =>
    createEslintAnalyzer({
      name: check.name,
      version: eslintVersion,
      configurationHash,
      configRelativePath: check.configRelativePath,
      patterns: check.patterns,
      exclusions: check.exclusions,
      policyFiles: check.policyFiles,
      timeoutMs: check.timeoutMs,
      timeoutScale: check.timeoutScale,
      shardWeight: check.shardWeight,
      colocatedWith: check.colocatedWith,
      carriedBy: check.carriedBy,
      carries: check.carries,
      policyFromPackage: true,
    }),
  );
}

function createStaticAnalyzer(check: QualityChecks['staticChecks'][number]): PackageAnalyzer {
  return keyedBy(
    [...STATIC_CHECK_ADAPTER_FILES, ...check.configurationFiles],
    [],
    (configurationHash) =>
      createStaticCheckAnalyzer({
        name: check.name,
        kind: check.kind,
        version: check.version,
        configurationHash,
        exclusions: check.exclusions,
        configRelativePath: check.configRelativePath,
        ignoreRelativePath: check.ignoreRelativePath,
        patterns: check.patterns,
        includeOnly: undefined,
        exclude: undefined,
        timeoutMs: check.timeoutMs,
        timeoutScale: check.timeoutScale,
        shardWeight: check.shardWeight,
      }),
  );
}

function buildAnalyzers(checks: QualityChecks): PackageAnalyzer[] {
  const { eslintChecks, entryPointsCheck, staticChecks, qualityAreaChecks } = checks;
  return [
    ...eslintChecks.map(createEslintCheckAnalyzer),
    keyedBy(
      [...ENTRY_POINT_ADAPTER_FILES, ...entryPointsCheck.logicalFiles],
      [],
      (configurationHash) =>
        createEntryPointAnalyzer({
          version: entryPointsCheck.version,
          configurationHash,
          exclusions: entryPointsCheck.exclusions,
          sourceRoots: entryPointsCheck.sourceRoots,
          shardWeight: entryPointsCheck.shardWeight,
        }),
    ),
    ...staticChecks.map(createStaticAnalyzer),
    ...qualityAreaChecks
      .filter((check) => check.name !== 'policy-tests')
      .map((check) => createQualityAreaCheckAnalyzer(check)),
  ];
}

function createQualityAreaCheckAnalyzer(
  check: QualityCheck,
  adapterArguments: readonly string[] | undefined = check.adapterArguments,
): PackageAnalyzer {
  return keyedBy(
    [...QUALITY_AREA_ADAPTER_FILES, ...check.configurationFiles],
    adapterArguments,
    (configurationHash) =>
      createQualityAreaAnalyzer({
        name: check.name,
        kind: check.kind,
        version: check.version,
        configurationHash,
        exclusions: check.exclusions,
        timeoutMs: check.timeoutMs,
        timeoutScale: check.timeoutScale,
        dependencies: check.dependencies,
        adapterArguments,
        concurrencyWeight: check.concurrencyWeight,
        concurrencyGroup: check.concurrencyGroup,
        executionPriority: check.executionPriority,
        reportedTools: check.reportedTools,
        shardWeight: check.shardWeight,
        publishesModuleImports: check.publishesModuleImports,
      }),
  );
}

const SOURCE_INPUTS = sourceInputs([
  ...codeExtensionNames,
  ...stylesheetExtensionNames,
  'html',
  'vue',
  'svelte',
  'astro',
]);

function withPackagePolicy(analyzer: PackageAnalyzer): PackageAnalyzer {
  analyzer.inputs = EXECUTION_ANALYZERS.has(analyzer.name) ? EXECUTION_INPUTS : SOURCE_INPUTS;
  analyzer.resolveVersion = (projectRoot) => resolveAnalyzerVersion(analyzer.name, projectRoot);
  analyzer.policyFromPackage = true;
  return withSizeScales(analyzer);
}

function buildPackageAnalyzers(layout: ResolvedLayout): PackageAnalyzer[] {
  return buildAnalyzers(createQualityChecks(layout))
    .map(withPackagePolicy)
    .map((analyzer) =>
      analyzer.name === 'coding-standards'
        ? withLegacyInventory(analyzer, DEFAULT_LEGACY_INVENTORY)
        : analyzer,
    );
}

export function configuredAnalyzers(): PackageAnalyzer[] {
  return buildPackageAnalyzers(resolveLayout());
}

export function javascriptAnalyzers(): PackageAnalyzer[] {
  return buildPackageAnalyzers(resolveLayout(undefined, undefined, { javascript: true }));
}

export function applyLayout(
  analyzers: readonly PackageAnalyzer[],
  headPolicy: HeadPolicyFile | undefined,
): readonly PackageAnalyzer[] {
  const customized =
    (headPolicy?.exclude ?? []).length > 0 ||
    Object.keys(headPolicy?.layout ?? {}).some((key) => key !== 'excludedGlobs');
  if (!customized) {
    return analyzers;
  }
  const rebuilt = new Map(
    buildPackageAnalyzers(resolveLayoutFor(headPolicy)).map((analyzer) => [
      analyzer.name,
      analyzer,
    ]),
  );
  return analyzers.map((analyzer) =>
    analyzer.policyFromPackage === true ? (rebuilt.get(analyzer.name) ?? analyzer) : analyzer,
  );
}

const TYPESCRIPT_FREE_ANALYZERS = new Set(['prettier-format', 'duplicates', 'dead-code']);

export function runsProjectTests(analyzerName: string): boolean {
  return TEST_RUNNER_ANALYZERS.has(analyzerName);
}

export function needsProjectTypeScript(analyzerName: string): boolean {
  return !TYPESCRIPT_FREE_ANALYZERS.has(analyzerName);
}

export function applyTestRunner(
  analyzers: readonly PackageAnalyzer[],
  headPolicy: HeadPolicyFile = {},
): readonly PackageAnalyzer[] {
  const configured = headPolicy.tools?.tests?.runner;
  if (configured === undefined) {
    return analyzers;
  }
  return analyzers.map((analyzer) =>
    analyzer.policyFromPackage === true && TEST_RUNNER_ANALYZERS.has(analyzer.name)
      ? {
          ...analyzer,
          resolveVersion: (projectRoot: string) =>
            testRunnerAnalyzerVersion(analyzer.name, projectRoot, { configuredRunner: configured }),
        }
      : analyzer,
  );
}

export function applyThresholds(
  analyzers: readonly PackageAnalyzer[],
  thresholds: { readonly crapLimit?: number | undefined } = {},
  headPolicy: HeadPolicyFile = {},
): readonly PackageAnalyzer[] {
  const crapCheck = createQualityChecks(resolveLayoutFor(headPolicy)).qualityAreaChecks.find(
    ({ name }) => name === 'crap',
  );
  if (thresholds.crapLimit === undefined || crapCheck === undefined) {
    return analyzers;
  }
  return analyzers.map((analyzer) =>
    analyzer.name === 'crap'
      ? withPackagePolicy(
          createQualityAreaCheckAnalyzer(crapCheck, [
            '--crap-score-limit',
            String(thresholds.crapLimit),
          ]),
        )
      : analyzer,
  );
}

export function applyLegacyInventory(
  analyzers: readonly PackageAnalyzer[],
  legacyInventory: string = DEFAULT_LEGACY_INVENTORY,
): PackageAnalyzer[] {
  return analyzers.map((analyzer) =>
    analyzer.name === 'coding-standards'
      ? withLegacyInventory(analyzer, legacyInventory)
      : analyzer,
  );
}
