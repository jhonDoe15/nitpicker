import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { readHeadPolicy, readLayout } from '../../../preset/head-policy.mjs';
import {
  layoutKnipProductionConfig,
  withEntryExports,
} from '../../../preset/unused-api/test-only/production-config.mjs';
import {
  needsProductionRun,
  testOnlyExportFindings,
} from '../../../preset/unused-api/test-only/test-only-exports.mjs';
import { loadPackages } from '../../../preset/unused-api/workspace/packages.mjs';
import { failure, runProgramAnalysis } from './program/program-analysis.mjs';

const ANALYZER = 'languages/typescript/preset/unused-api/analyze.mjs';

/** Unused props and options; a failure is a tool error, so the other structure checks still report. */
export function runUnusedApi(options) {
  return runProgramAnalysis(options, {
    rule: 'unused-api',
    analyzer: ANALYZER,
    linkName: '.nitpicker-diff-unused-api-tsconfig.json',
    exportName: 'analyzeUnusedApi',
  });
}

function testOnlyFindings(options, { config, normal, knip }) {
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
      entryPatterns: productionConfig.entry,
      projectRoot: options.projectRoot,
      analyzerName: options.analyzerName,
      isExcepted: exceptionMatcher(readHeadPolicy().exceptions),
    },
  });
}

/** Test-only exports and modules; a failed knip run is a tool error next to the normal findings. */
export function runTestOnlyExports(options, runs) {
  try {
    return testOnlyFindings(options, runs);
  } catch (error) {
    return failure(options, 'test-only-export', error);
  }
}
