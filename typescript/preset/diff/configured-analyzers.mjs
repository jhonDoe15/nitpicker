import { createEntryPointAnalyzer } from '../../adapters/diff/entry-points.mjs';
import { createEslintAnalyzer } from '../../adapters/diff/eslint.mjs';
import { createQualityAreaAnalyzer } from '../../adapters/diff/quality-areas.mjs';
import { createStaticCheckAnalyzer } from '../../adapters/diff/static-checks.mjs';
import {
  entryPointsCheck,
  eslintChecks,
  eslintVersion,
  hashFiles,
  qualityAreaChecks,
  staticChecks,
} from '../quality-checks.mjs';

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
];
const QUALITY_AREA_ADAPTER_FILES = [
  'preset/quality-checks.mjs',
  ...ANALYZER_RUNTIME_FILES,
  'adapters/diff/quality-areas.mjs',
  'adapters/diff/quality-areas-runner.mjs',
];

export const configuredAnalyzers = [
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
    configurationHash: hashFiles([...ENTRY_POINT_ADAPTER_FILES, ...entryPointsCheck.logicalFiles]),
    exclusions: entryPointsCheck.exclusions,
    sourceRoot: entryPointsCheck.sourceRoot,
    shardWeight: entryPointsCheck.shardWeight,
  }),
  ...staticChecks.map((check) =>
    createStaticCheckAnalyzer({
      ...check,
      configurationHash: hashFiles([...STATIC_CHECK_ADAPTER_FILES, ...check.configurationFiles]),
    }),
  ),
  ...qualityAreaChecks.map((check) =>
    createQualityAreaAnalyzer({
      ...check,
      configurationHash: hashFiles(
        [...QUALITY_AREA_ADAPTER_FILES, ...check.configurationFiles],
        check.adapterArguments,
      ),
    }),
  ),
];
