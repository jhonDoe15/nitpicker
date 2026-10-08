import { sourceRoots, excludedGlobs, testGlobs } from '../layout.mjs';

export default {
  sourcePaths: sourceRoots,
  coverageReportPath: 'reports/quality/coverage/coverage-final.json',
  outputPath: 'reports/quality/crap/report.json',
  excludes: [...excludedGlobs, ...testGlobs],
};
