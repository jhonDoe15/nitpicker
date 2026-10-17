import { describe, expect, it } from 'vitest';
import { isStrictRule } from '../../typescript/preset/strict-rules.mjs';
import { PYTHON_RULES_IDS, RULES_TOOL } from './rule-hints.mjs';
import { isPythonTouchedRule } from './touched-rules.mjs';

describe('the Python rules held to the touched-code standard', () => {
  it('include every rule of the rules script', () => {
    for (const rule of PYTHON_RULES_IDS) {
      expect(isPythonTouchedRule(rule, { tool: RULES_TOOL }), rule).toBe(true);
      expect(isStrictRule(rule, { tool: RULES_TOOL }), rule).toBe(true);
    }
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
