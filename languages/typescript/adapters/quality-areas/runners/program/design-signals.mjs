import { runProgramAnalysis } from './program-analysis.mjs';

const ANALYZER = 'languages/typescript/preset/design/analyze.mjs';

/** The deep-module design rules; a failure is a tool error, so the other structure checks still report. */
export function runDesignSignals(options) {
  return runProgramAnalysis(options, {
    rule: 'design-signals',
    analyzer: ANALYZER,
    linkName: '.nitpicker-diff-design-signals-tsconfig.json',
    exportName: 'analyzeDesignSignals',
  });
}
