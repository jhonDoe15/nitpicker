import { readLayout } from '../head-policy.mjs';

const { sourceRoots, runtimeExcludedGlobs, testGlobs, testSupportGlobs } = readLayout();

export default {
  sourcePaths: sourceRoots,
  coverageReportPath: 'reports/quality/coverage/coverage-final.json',
  outputPath: 'reports/quality/crap/report.json',
  excludes: [...runtimeExcludedGlobs, ...testGlobs, ...testSupportGlobs],
};
