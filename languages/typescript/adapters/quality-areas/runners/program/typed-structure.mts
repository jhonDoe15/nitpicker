import type { Finding } from '../../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../../typed/area-types.mts';
import { findingsOf, policyExport } from '../../typed/tooling.mts';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import { failure, linkedAnalysis } from './program-analysis.mts';

const ANALYZER = 'languages/typescript/preset/design/typed-structure.mjs';
const RULES = ['unused-api', 'design-signals'];

function ruleFindings(options: QualityAreaOptions, rule: string, outcome: unknown): Finding[] {
  const part = fieldOf(outcome, rule);
  return Array.isArray(part)
    ? findingsOf(part)
    : failure(options, rule, String(fieldOf(part, 'error')));
}

export async function runTypedStructure(options: QualityAreaOptions): Promise<Finding[]> {
  try {
    const analyze = await policyExport(options, ANALYZER, 'analyzeTypedStructure');
    const outcome = linkedAnalysis(options, {
      linkName: '.nitpicker-diff-typed-structure-tsconfig.json',
      analyze,
    });
    return RULES.flatMap((rule) => ruleFindings(options, rule, outcome));
  } catch (error) {
    return RULES.flatMap((rule) => failure(options, rule, error));
  }
}
