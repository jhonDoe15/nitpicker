import { decidedConditionFindings } from '../../../../../shared/rules/decided/decided-conditions.mts';
import { ruleLines } from './rule-lines.mts';

export const decided = ruleLines(decidedConditionFindings, 'facts');
