import { describe, expect, it } from 'vitest';
import { isStrictRule } from '../../typescript/preset/strict-rules.mts';
import { PYTHON_RULES_IDS, RULES_TOOL } from './rule-hints.mts';
import { isPythonTouchedRule } from './touched-rules.mts';

const RULE_IDS = PYTHON_RULES_IDS.filter((rule) => typeof rule === 'string');

describe('the Python rules held to the touched-code standard', () => {
  it.each(RULE_IDS)('include the rule %s of the rules script', (rule) => {
    expect(isPythonTouchedRule(rule, { tool: RULES_TOOL })).toBe(true);
    expect(isStrictRule(rule, { tool: RULES_TOOL })).toBe(true);
  });

  it.each(['S602', 'S604', 'S605', 'PLR2004', 'BLE001', 'ERA001'])(
    'include the ruff rule %s',
    (rule) => {
      expect(isPythonTouchedRule(rule, { tool: 'ruff' })).toBe(true);
    },
  );

  it('leave the other ruff rules and other tools to the base comparison', () => {
    expect(isPythonTouchedRule('E501', { tool: 'ruff' })).toBe(false);
    expect(isPythonTouchedRule('S602', { tool: 'mypy' })).toBe(false);
    expect(isPythonTouchedRule('swallowed-exception', { tool: 'ruff' })).toBe(false);
    expect(isPythonTouchedRule('swallowed-exception')).toBe(false);
  });
});
