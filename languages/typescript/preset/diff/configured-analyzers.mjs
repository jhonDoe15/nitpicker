import {
  DEFAULT_LEGACY_INVENTORY,
  withLegacyInventory,
} from '../../../../shared/legacy-inventory.mjs';
import { resolveAnalyzerVersion } from '../analyzer-versions.mjs';
import { createEntryPointAnalyzer } from '../../adapters/entry-points.mjs';
import { createEslintAnalyzer } from '../../adapters/eslint.mjs';
import { createQualityAreaAnalyzer } from '../../adapters/quality-areas.mjs';
import { createStaticCheckAnalyzer } from '../../adapters/static-checks.mjs';
import { resolveLayout } from '../layout.mjs';
import { createQualityChecks, eslintVersion, hashFiles } from '../quality-checks.mjs';

const ANALYZER_RUNTIME_FILES = [
  'core/diff/analyzer-scheduler.mjs',
  'core/diff/report-model.mjs',
  'core/diff/run-analyzers.mjs',
];
const ESLINT_ADAPTER_FILES = [
  'languages/typescript/preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/eslint.mjs',
  'languages/typescript/adapters/eslint-runner.mjs',
  'languages/typescript/adapters/eslint-config-wrapper.mjs',
  'core/tooling/policy-links.mjs',
  'core/tooling/temporary-files.mjs',
];
const ENTRY_POINT_ADAPTER_FILES = [
  'languages/typescript/preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/entry-points.mjs',
  'languages/typescript/adapters/entry-points-runner.mjs',
];
const STATIC_CHECK_ADAPTER_FILES = [
  'languages/typescript/preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/static-checks.mjs',
  'languages/typescript/adapters/static-checks-runner.mjs',
  'core/tooling/policy-links.mjs',
  'core/tooling/temporary-files.mjs',
];
const QUALITY_AREA_ADAPTER_FILES = [
  'languages/typescript/preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/quality-areas.mjs',
  'languages/typescript/adapters/quality-areas-runner.mjs',
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

export function applyLegacyInventory(analyzers, legacyInventory = DEFAULT_LEGACY_INVENTORY) {
  return analyzers.map((analyzer) =>
    analyzer.name === 'coding-standards'
      ? withLegacyInventory(analyzer, legacyInventory)
      : analyzer,
  );
}
