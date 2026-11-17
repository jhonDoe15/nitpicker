import { describe, expect, it } from 'vitest';
import { failingFirstLines } from '../../console/text-sections.mts';
import { inPriorityOrder } from './finding-order.mts';
import type { ReportEntry } from '../../../../../shared/values/findings.mts';

function finding(tool: string, rule: string, path: string, line: number): ReportEntry {
  return { tool, rule, path, message: rule, classification: 'enforceable', location: { line } };
}

const FORMAT = finding('prettier-format', 'prettier/prettier', 'src/a.ts', 1);
const BUG = finding('typescript-typecheck', 'TS2345', 'src/z.ts', 9);
const SIMPLER = finding('pmd', 'UnusedPrivateField', 'src/B.java', 2);
const SIMPLER_EARLIER = finding('pmd', 'UnusedPrivateField', 'src/A.java', 7);

describe('finding priority order', () => {
  it('lists bug findings first and style last, then by path and line', () => {
    expect(inPriorityOrder([FORMAT, SIMPLER, BUG, SIMPLER_EARLIER])).toEqual([
      BUG,
      SIMPLER_EARLIER,
      SIMPLER,
      FORMAT,
    ]);
  });

  it('orders the failing findings of report.txt the same way', () => {
    expect(failingFirstLines('New', [FORMAT, BUG])).toEqual([
      '',
      'New failing findings:',
      'typescript-typecheck/TS2345 src/z.ts:9 TS2345',
      'prettier-format/prettier/prettier src/a.ts:1 prettier/prettier',
    ]);
  });
});
