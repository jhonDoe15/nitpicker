export default {
  sourcePaths: ['src/main'],
  coverageReportPath: 'reports/quality/coverage/coverage-final.json',
  outputPath: 'reports/quality/crap/report.json',
  excludes: [
    'src/main/**/*.d.ts',
    'src/main/**/__tests__/**',
    'src/main/**/*.test.ts',
    'src/main/dist/**',
  ],
};
