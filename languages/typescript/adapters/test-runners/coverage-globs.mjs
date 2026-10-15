export const COVERAGE_DIRECTORY = 'reports/quality/coverage';

export const COVERAGE_REPORT_PATH = `${COVERAGE_DIRECTORY}/coverage-final.json`;

export const TEST_TIMEOUT_MS = 10_000;

export const TEST_WORKERS = 4;

export function coverageIncludeGlobs(layout) {
  return layout.sourceGlobs;
}

export function coverageExcludeGlobs(layout) {
  return [...layout.excludedGlobs, ...layout.testGlobs, ...layout.sourceTestDirectoryGlobs];
}
