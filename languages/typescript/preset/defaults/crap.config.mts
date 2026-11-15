import { readLayout as readUntypedLayout } from '../head-policy.mjs';

const readLayout: () => {
  readonly sourceRoots: readonly string[];
  readonly runtimeExcludedGlobs: readonly string[];
  readonly testGlobs: readonly string[];
  readonly testSupportGlobs: readonly string[];
} = readUntypedLayout;

const { sourceRoots, runtimeExcludedGlobs, testGlobs, testSupportGlobs } = readLayout();

export default {
  sourcePaths: sourceRoots,
  coverageReportPath: 'reports/quality/coverage/coverage-final.json',
  outputPath: 'reports/quality/crap/report.json',
  excludes: [...runtimeExcludedGlobs, ...testGlobs, ...testSupportGlobs],
};
