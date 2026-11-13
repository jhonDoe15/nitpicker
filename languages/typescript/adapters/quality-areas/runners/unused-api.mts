import type { Finding } from '../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../typed/area-types.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { readLayout } from '../../typed/head-policy.mts';
import {
  type KnipConfig,
  exceptionMatcher,
  layoutKnipProductionConfig,
  loadPackages,
  needsProductionRun,
  readHeadPolicy,
  testOnlyExportFindings,
  withEntryExports,
} from '../typed/policy.mts';
import { failure, runProgramAnalysis } from './program/program-analysis.mts';

type KnipRuns = {
  readonly config: KnipConfig;
  readonly normal: unknown;
  readonly knip: (config: KnipConfig) => unknown;
};

const ANALYZER = 'languages/typescript/preset/unused-api/analyze.mjs';

export function runUnusedApi(options: QualityAreaOptions): Promise<Finding[]> {
  return runProgramAnalysis(options, {
    rule: 'unused-api',
    analyzer: ANALYZER,
    linkName: '.nitpicker-diff-unused-api-tsconfig.json',
    exportName: 'analyzeUnusedApi',
  });
}

function testOnlyFindings(
  options: QualityAreaOptions,
  { config, normal, knip }: KnipRuns,
): Finding[] {
  const layout = readLayout();
  const packagesInfo = loadPackages(options.projectRoot, layout);
  const hasTests = layout.projectCodeFiles(options.projectRoot).some(layout.isTestFile);
  if (!hasTests || !needsProductionRun(packagesInfo, options.projectRoot)) {
    return [];
  }
  const productionConfig = layoutKnipProductionConfig(config, layout);
  return testOnlyExportFindings({
    normal,
    production: knip(productionConfig),
    entryExportsRun: () => knip(withEntryExports(productionConfig)),
    packagesInfo,
    context: {
      layout,
      entryPatterns: fieldOf(productionConfig, 'entry'),
      projectRoot: options.projectRoot,
      analyzerName: options.analyzerName,
      isExcepted: exceptionMatcher(readHeadPolicy().exceptions),
    },
  });
}

export function runTestOnlyExports(options: QualityAreaOptions, runs: KnipRuns): Finding[] {
  try {
    return testOnlyFindings(options, runs);
  } catch (error) {
    return failure(options, 'test-only-export', error);
  }
}
