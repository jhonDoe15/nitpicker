import { describe, expect, it } from 'vitest';
import { foldStyle } from './style-fold.mts';
import type { ReportEntry } from '../../../../../shared/values/findings.mts';

function finding(tool: string, rule: string, line: number): ReportEntry {
  return { tool, rule, path: 'src/a.ts', message: rule, location: { line } };
}

const FORMAT = finding('prettier-format', 'prettier/prettier', 1);
const ENUM = finding('eslint-lint', 'no-restricted-syntax', 2);
const SECOND_ENUM = finding('eslint-lint', 'no-restricted-syntax', 3);
const BUG = finding('typescript-typecheck', 'TS2345', 4);

describe('folding style rules', () => {
  it('replaces the style findings with one count line', () => {
    expect(foldStyle([FORMAT, BUG, ENUM, SECOND_ENUM], true)).toEqual({
      shown: [BUG],
      lines: [
        '  style: 3 findings from 2 rules, folded (list them with --label style or --details)',
      ],
    });
  });

  it('keeps every finding when folding is off or only style findings are left', () => {
    const findings = [FORMAT, BUG];
    expect(foldStyle(findings, false)).toEqual({ shown: findings, lines: [] });
    expect(foldStyle([FORMAT, ENUM], true)).toEqual({ shown: [FORMAT, ENUM], lines: [] });
    expect(foldStyle([BUG], true)).toEqual({ shown: [BUG], lines: [] });
  });

  it('counts one finding of one rule in the singular', () => {
    expect(foldStyle([BUG, FORMAT], true).lines).toEqual([
      '  style: 1 finding from 1 rule, folded (list them with --label style or --details)',
    ]);
  });
});
