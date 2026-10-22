import { describe, expect, it } from 'vitest';
import { renderConsoleSummary } from '../summary.mjs';
import { finding, report } from '../test-support/report-builders.mjs';

function note(index) {
  return finding({
    tool: 'structure',
    rule: 'data-clump',
    path: `src/m${String(index)}.ts`,
    identity: `clump-${String(index)}`,
    message: 'The parameters travel together.',
    classification: 'descriptive',
    location: { line: 3 },
  });
}

describe('design notes in the console summary', () => {
  it('lists new report-only design findings after the gate result', () => {
    const summary = renderConsoleSummary(report({ newFindings: [note(1)] }), { color: false });
    expect(summary.split('\n')).toEqual([
      '',
      'Quality gate summary',
      '✓ No new enforceable violations',
      'Design note for review (not failing): 1 new',
      '  structure/data-clump src/m1.ts:3',
      '    The parameters travel together.',
      'Full diagnostics: reports/quality/diff/combined/report.txt',
      '',
    ]);
  });

  it('lists ten notes and counts the rest', () => {
    const notes = Array.from({ length: 12 }, (_, index) => note(index));
    const lines = renderConsoleSummary(report({ newFindings: notes }), { color: false }).split(
      '\n',
    );
    expect(lines.slice(3, 4).concat(lines.slice(-3, -2))).toEqual([
      'Design notes for review (not failing): 12 new',
      '  and 2 more in the full diagnostics',
    ]);
  });

  it('leaves out other report-only findings', () => {
    const other = { ...note(1), rule: 'module-coupling' };
    const summary = renderConsoleSummary(report({ newFindings: [other] }), { color: false });
    expect(summary.includes('Design note')).toBe(false);
  });
});
