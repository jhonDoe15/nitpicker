import {
  DEFAULT_LEGACY_INVENTORY,
  withLegacyInventory,
} from '../../../../shared/legacy-inventory.mjs';
import { resolveAnalyzerVersion, testRunnerAnalyzerVersion } from '../analyzer-versions.mjs';
import { createEntryPointAnalyzer } from '../../adapters/entry-points.mjs';
import { createEslintAnalyzer } from '../../adapters/eslint/analyzer.mjs';
import { createQualityAreaAnalyzer } from '../../adapters/quality-areas/analyzer.mjs';
import { createStaticCheckAnalyzer } from '../../adapters/static-checks/analyzer.mjs';
import { resolveLayout, resolveLayoutFor } from '../layout.mjs';
import { createQualityChecks } from '../quality-checks.mjs';
import { eslintVersion } from '../checks/constants.mjs';
import { hashFiles } from '../checks/hash.mjs';

const ANALYZER_RUNTIME_FILES = [
  'core/diff/execution/analyzer-scheduler.mjs',
  'core/diff/execution/run-analyzers.mjs',
  'languages/typescript/preset/syntax/children.mjs',
  'shared/filesystem.mjs',
];
const ESLINT_ADAPTER_FILES = [
  'languages/typescript/preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/eslint/analyzer.mjs',
  'languages/typescript/adapters/eslint-runner.mjs',
  'languages/typescript/adapters/eslint-wrapper.config.mjs',
  'languages/typescript/adapters/oxlint/oxlint-bridge.mjs',
  'languages/typescript/adapters/oxlint/oxlint-plan.mjs',
];
const ENTRY_POINT_ADAPTER_FILES = [
  'languages/typescript/preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/entry-points-runner.mjs',
];
const STATIC_CHECK_ADAPTER_FILES = [
  'languages/typescript/preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/static-checks/analyzer.mjs',
  'languages/typescript/adapters/static-checks-runner.mjs',
];
const QUALITY_AREA_ADAPTER_FILES = [
  'languages/typescript/preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'languages/typescript/adapters/quality-areas/analyzer.mjs',
  'languages/typescript/adapters/quality-areas-runner.mjs',
];

function keyedBy(files, configurationValues, create) {
  return {
    ...create(hashFiles(files, configurationValues)),
    cacheKeyFiles: files,
  };
}

function buildAnalyzers(checks) {
  const { eslintChecks, entryPointsCheck, staticChecks, qualityAreaChecks } = checks;
  return [
    ...eslintChecks.map((check) =>
      keyedBy([...ESLINT_ADAPTER_FILES, ...check.configurationFiles], [], (configurationHash) =>
        createEslintAnalyzer({
          name: check.name,
          version: eslintVersion,
          configurationHash,
          configRelativePath: check.configRelativePath,
          patterns: check.patterns,
          exclusions: check.exclusions,
          policyFiles: check.policyFiles,
          shardWeight: check.shardWeight,
        }),
      ),
    ),
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
    ...staticChecks.map((check) =>
      keyedBy(
        [...STATIC_CHECK_ADAPTER_FILES, ...check.configurationFiles],
        [],
        (configurationHash) => createStaticCheckAnalyzer({ ...check, configurationHash }),
      ),
    ),
    ...qualityAreaChecks
      .filter((check) => check.name !== 'policy-tests')
      .map((check) => createQualityAreaCheckAnalyzer(check)),
  ];
}

function createQualityAreaCheckAnalyzer(check, adapterArguments = check.adapterArguments) {
  return keyedBy(
    [...QUALITY_AREA_ADAPTER_FILES, ...check.configurationFiles],
    adapterArguments,
    (configurationHash) =>
      createQualityAreaAnalyzer({ ...check, adapterArguments, configurationHash }),
  );
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

export function configuredAnalyzers() {
  return buildPackageAnalyzers(resolveLayout());
}

export function javascriptAnalyzers() {
  return buildPackageAnalyzers(resolveLayout(undefined, undefined, { javascript: true }));
}

export function applyLayout(analyzers, headPolicy) {
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

const TEST_RUNNER_ANALYZERS = new Set(['coverage', 'mutation', 'test-console']);

export function applyTestRunner(analyzers, headPolicy = {}) {
  const configured = headPolicy.tools?.tests?.runner;
  if (configured === undefined) {
    return analyzers;
  }
  return analyzers.map((analyzer) =>
    analyzer.policyFromPackage === true && TEST_RUNNER_ANALYZERS.has(analyzer.name)
      ? {
          ...analyzer,
          resolveVersion: (projectRoot) =>
            testRunnerAnalyzerVersion(analyzer.name, projectRoot, { configuredRunner: configured }),
        }
      : analyzer,
  );
}

export function applyThresholds(analyzers, thresholds = {}, headPolicy = {}) {
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

export function applyLegacyInventory(analyzers, legacyInventory = DEFAULT_LEGACY_INVENTORY) {
  return analyzers.map((analyzer) =>
    analyzer.name === 'coding-standards'
      ? withLegacyInventory(analyzer, legacyInventory)
      : analyzer,
  );
}
