import { describe, expect, it } from 'vitest';
import { RULES_TOOL } from '../hints/tool.mjs';
import { withoutShadowedFindings } from './shadowed-findings.mjs';

function at(tool, rule, line, path = 'src/a.py') {
  return { tool, rule, path, location: { line }, message: 'm' };
}

const swallowed = (line, path) => at(RULES_TOOL, 'swallowed-exception', line, path);
const unused = (line, path) => at('ruff', 'F841', line, path);

describe('withoutShadowedFindings', () => {
  it('drops the unused exception variable on the line of a swallowed exception', () => {
    expect(withoutShadowedFindings([swallowed(9), unused(9)])).toEqual([swallowed(9)]);
  });

  it('keeps an unused variable on any other line or in any other file', () => {
    const kept = [unused(15), unused(9, 'src/b.py')];
    expect(withoutShadowedFindings([swallowed(9), ...kept])).toEqual([swallowed(9), ...kept]);
  });

  it('keeps the unused variable when the exception is not swallowed', () => {
    expect(withoutShadowedFindings([unused(9)])).toEqual([unused(9)]);
  });

  it('keeps other ruff findings on the line', () => {
    const blind = at('ruff', 'BLE001', 9);
    expect(withoutShadowedFindings([swallowed(9), blind])).toEqual([swallowed(9), blind]);
  });

  it('keeps the unused variable when an exception lifts the swallowed finding', () => {
    expect(withoutShadowedFindings([swallowed(9), unused(9)], { keepsOwner: () => false })).toEqual(
      [swallowed(9), unused(9)],
    );
  });

  it('keeps findings without a line', () => {
    const unlocated = { ...unused(9), location: undefined };
    expect(withoutShadowedFindings([swallowed(9), unlocated])).toEqual([swallowed(9), unlocated]);
  });
});
