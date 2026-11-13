import type { Finding } from '../../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../../typed/area-types.mts';
import { runProgramAnalysis } from './program-analysis.mts';

const ANALYZER = 'languages/typescript/preset/design/analyze.mjs';

export function runDesignSignals(options: QualityAreaOptions): Promise<Finding[]> {
  return runProgramAnalysis(options, {
    rule: 'design-signals',
    analyzer: ANALYZER,
    linkName: '.nitpicker-diff-design-signals-tsconfig.json',
    exportName: 'analyzeDesignSignals',
  });
}
