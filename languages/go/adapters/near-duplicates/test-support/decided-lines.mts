import { decidedConditionFindings as untypedDecidedConditionFindings } from '../../../../../shared/rules/decided/decided-conditions.mjs';
import type { RuleFindings } from './parse-go.mts';
import { ruleLines } from './rule-lines.mts';

const decidedConditionFindings: RuleFindings = untypedDecidedConditionFindings;

export const decided = ruleLines(decidedConditionFindings, 'facts');
