import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_LEGACY_INVENTORY } from '../coding-standards/inventory-path.mjs';
import { resolveAnalyzerVersion } from '../analyzer-versions.mjs';
import { createEntryPointAnalyzer } from '../../adapters/diff/entry-points.mjs';
import { createEslintAnalyzer } from '../../adapters/diff/eslint.mjs';
import { createQualityAreaAnalyzer } from '../../adapters/diff/quality-areas.mjs';
import { createStaticCheckAnalyzer } from '../../adapters/diff/static-checks.mjs';
import { resolveLayout } from '../layout.mjs';
import { createQualityChecks, eslintVersion, hashFiles } from '../quality-checks.mjs';

const ANALYZER_RUNTIME_FILES = [
  'core/diff/analyzer-scheduler.mjs',
  'core/diff/report-model.mjs',
  'core/diff/run-analyzers.mjs',
];
const ESLINT_ADAPTER_FILES = [
  'preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'adapters/diff/eslint.mjs',
  'adapters/diff/eslint-runner.mjs',
  'adapters/diff/eslint-config-wrapper.mjs',
  'adapters/policy-links.mjs',
  'adapters/temporary-files.mjs',
];
const ENTRY_POINT_ADAPTER_FILES = [
  'preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'adapters/diff/entry-points.mjs',
  'adapters/diff/entry-points-runner.mjs',
];
const STATIC_CHECK_ADAPTER_FILES = [
  'preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'adapters/diff/static-checks.mjs',
  'adapters/diff/static-checks-runner.mjs',
  'adapters/policy-links.mjs',
  'adapters/temporary-files.mjs',
];
const QUALITY_AREA_ADAPTER_FILES = [
  'preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'adapters/diff/quality-areas.mjs',
  'adapters/diff/quality-areas-runner.mjs',
  'shared/policy.mjs',
];

function buildAnalyzers(checks) {
  const { eslintChecks, entryPointsCheck, staticChecks, qualityAreaChecks } = checks;
  return [
    ...eslintChecks.map((check) =>
      createEslintAnalyzer({
        name: check.name,
        version: eslintVersion,
        configurationHash: hashFiles([...ESLINT_ADAPTER_FILES, ...check.configurationFiles]),
        configRelativePath: check.configRelativePath,
        patterns: check.patterns,
        exclusions: check.exclusions,
        policyFiles: check.policyFiles,
        shardWeight: check.shardWeight,
      }),
    ),
    createEntryPointAnalyzer({
      version: entryPointsCheck.version,
      configurationHash: hashFiles([
        ...ENTRY_POINT_ADAPTER_FILES,
        ...entryPointsCheck.logicalFiles,
      ]),
      exclusions: entryPointsCheck.exclusions,
      sourceRoots: entryPointsCheck.sourceRoots,
      shardWeight: entryPointsCheck.shardWeight,
    }),
    ...staticChecks.map((check) =>
      createStaticCheckAnalyzer({
        ...check,
        configurationHash: hashFiles([...STATIC_CHECK_ADAPTER_FILES, ...check.configurationFiles]),
      }),
    ),
    ...qualityAreaChecks
      .filter((check) => check.name !== 'policy-tests')
      .map((check) => createQualityAreaCheckAnalyzer(check)),
  ];
}

function createQualityAreaCheckAnalyzer(check, adapterArguments = check.adapterArguments) {
  return createQualityAreaAnalyzer({
    ...check,
    adapterArguments,
    configurationHash: hashFiles(
      [...QUALITY_AREA_ADAPTER_FILES, ...check.configurationFiles],
      adapterArguments,
    ),
  });
}

function withPackagePolicy(analyzer) {
  analyzer.resolveVersion = (projectRoot) => resolveAnalyzerVersion(analyzer.name, projectRoot);
  analyzer.policyFromPackage = true;
  return analyzer;
}

function buildPackageAnalyzers(layout) {
  return buildAnalyzers(createQualityChecks(layout))
    .map(withPackagePolicy)
    .map((analyzer) =>
      analyzer.name === 'coding-standards'
        ? withLegacyInventory(analyzer, DEFAULT_LEGACY_INVENTORY)
        : analyzer,
    );
}

export const configuredAnalyzers = buildPackageAnalyzers(resolveLayout());

/**
 * Rebuilds the preset's analyzers for the project's layout and `exclude` globs, so their
 * patterns, source roots and exclusions follow the config file. Analyzers that are not the
 * preset's own (custom or injected ones) pass through untouched.
 */
export function applyLayout(analyzers, headPolicy) {
  const customized =
    (headPolicy?.exclude ?? []).length > 0 ||
    Object.keys(headPolicy?.layout ?? {}).some((key) => key !== 'excludedGlobs');
  if (!customized) {
    return analyzers;
  }
  const rebuilt = new Map(
    buildPackageAnalyzers(resolveLayout(headPolicy.layout, headPolicy.exclude)).map((analyzer) => [
      analyzer.name,
      analyzer,
    ]),
  );
  return analyzers.map((analyzer) =>
    configuredAnalyzers.includes(analyzer) ? (rebuilt.get(analyzer.name) ?? analyzer) : analyzer,
  );
}

/** Applies config thresholds by rebuilding the affected analyzers; others pass through. */
export function applyThresholds(analyzers, thresholds = {}, headPolicy = {}) {
  const crapCheck = createQualityChecks(
    resolveLayout(headPolicy.layout, headPolicy.exclude),
  ).qualityAreaChecks.find(({ name }) => name === 'crap');
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

/** Points the coding-standards analyzer at the project's legacy inventory file. */
export function applyLegacyInventory(analyzers, legacyInventory = DEFAULT_LEGACY_INVENTORY) {
  return analyzers.map((analyzer) =>
    analyzer.name === 'coding-standards'
      ? withLegacyInventory(analyzer, legacyInventory)
      : analyzer,
  );
}

function withLegacyInventory(analyzer, legacyInventory) {
  const packageHash = analyzer.packageConfigurationHash ?? analyzer.configurationHash;
  return {
    ...analyzer,
    packageConfigurationHash: packageHash,
    legacyInventory,
    createInvocation: (context) => {
      const invocation = analyzer.createInvocation(context);
      return { ...invocation, args: [...invocation.args, '--legacy-inventory', legacyInventory] };
    },
    resolveConfigurationHash: (projectRoot) => {
      const inventory = path.join(projectRoot, legacyInventory);
      return existsSync(inventory)
        ? createHash('sha256').update(packageHash).update(readFileSync(inventory)).digest('hex')
        : packageHash;
    },
  };
}
