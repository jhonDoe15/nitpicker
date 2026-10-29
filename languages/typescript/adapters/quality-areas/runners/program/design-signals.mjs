import { runProgramAnalysis } from './program-analysis.mjs';

const ANALYZER = 'languages/typescript/preset/design/analyze.mjs';

export function runDesignSignals(options) {
  return runProgramAnalysis(options, {
    rule: 'design-signals',
    analyzer: ANALYZER,
    linkName: '.nitpicker-diff-design-signals-tsconfig.json',
    exportName: 'analyzeDesignSignals',
  });
}
