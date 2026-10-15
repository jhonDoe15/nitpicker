import { describe, expect, it } from 'vitest';
import { renderConsoleSummary } from './summary.mjs';
import { renderTextReport } from './text.mjs';
import { finding, report } from './test-support/report-builders.mjs';

describe('touched, still over limit', () => {
  const held = finding({
    tool: 'structure',
    rule: 'function-lines-limit',
    message: 'computeInvoice has 68 lines; limit is 50',
    location: { line: 3 },
    heldAtBase: 68,
    ratchet: {
      key: 'k',
      value: 68,
      worseMessage: 'grew from {base}',
      heldMessage:
        'computeInvoice: 68 lines (limit 50), allowed because base was {base}; any increase fails.',
    },
  });
  const untouched = finding({ rule: 'no-console', identity: 'unchanged:1' });
  const heldLint = finding({
    rule: '@typescript-eslint/no-explicit-any',
    message: 'Unexpected any.',
    heldAtBase: 2,
    ratchet: { key: 'count:any', value: 2, existingCodeOnly: true },
  });
  it('lists a held finding as a note in the text report', () => {
    const text = renderTextReport(report({ unchangedFindings: [held, untouched] }));

    expect(text).toBe(
      [
        'Nitpicker quality diff',
        'Base ref: main',
        'Merge base: abc',
        'Head: def',
        'Status: completed',
        'New enforceable findings: 0',
        'New findings: 0',
        'Resolved findings: 0',
        'Unchanged findings: 0',
        'Changed metrics: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'eslint: base=0 head=1 new=1 resolved=0 unchanged=0 changed-metrics=undefined elapsed=0.040s',
        '',
        'Touched, still over limit (not failing):',
        'structure/function-lines-limit src/a.js:3 computeInvoice: 68 lines (limit 50), allowed because base was 68; any increase fails.',
        '',
      ].join('\n'),
    );
  });
  it('lists a held finding as a note in the console summary without failing', () => {
    const summary = renderConsoleSummary(report({ unchangedFindings: [held] }), { color: false });

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 finding still over a limit in touched code (not failing, not worse than before):',
        '  structure/function-lines-limit src/a.js:3 computeInvoice: 68 lines (limit 50), allowed because base was 68; any increase fails.',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });
  it('words a held lint finding by what it is, not as a function over a limit', () => {
    const text = renderTextReport(report({ unchangedFindings: [held, heldLint] }));
    const summary = renderConsoleSummary(report({ unchangedFindings: [held, heldLint] }), {
      color: false,
    });

    expect(text).toBe(
      [
        'Nitpicker quality diff',
        'Base ref: main',
        'Merge base: abc',
        'Head: def',
        'Status: completed',
        'New enforceable findings: 0',
        'New findings: 0',
        'Resolved findings: 0',
        'Unchanged findings: 0',
        'Changed metrics: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'eslint: base=0 head=1 new=1 resolved=0 unchanged=0 changed-metrics=undefined elapsed=0.040s',
        '',
        'Touched, still over limit (not failing):',
        'structure/function-lines-limit src/a.js:3 computeInvoice: 68 lines (limit 50), allowed because base was 68; any increase fails.',
        '',
        'Existing lint findings in edited code (not failing):',
        'eslint/@typescript-eslint/no-explicit-any src/a.js:12 Unexpected any. (2 at base and now; any increase fails)',
        '',
      ].join('\n'),
    );
    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 finding still over a limit in touched code (not failing, not worse than before):',
        '  structure/function-lines-limit src/a.js:3 computeInvoice: 68 lines (limit 50), allowed because base was 68; any increase fails.',
        'Note: 1 existing lint finding in edited code (not failing, no more than before):',
        '  eslint/@typescript-eslint/no-explicit-any src/a.js:12 Unexpected any. (2 at base and now; any increase fails)',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });
  it('words a held function metric without contradicting its limit', () => {
    const heldCrap = finding({
      tool: 'crap',
      rule: 'crap-score-limit',
      message:
        'summarizeShipping has CRAP 10.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
      location: { line: 22 },
      heldAtBase: 16.02,
      ratchet: {
        key: 'k',
        value: 10,
        worseMessage: 'rose',
        heldMessage:
          'summarizeShipping: CRAP 10.00 (limit 9), allowed because base was {base}; any increase fails.',
      },
    });

    const summary = renderConsoleSummary(report({ unchangedFindings: [heldCrap] }), {
      color: false,
    });

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 finding still over a limit in touched code (not failing, not worse than before):',
        '  crap/crap-score-limit src/a.js:22 summarizeShipping: CRAP 10.00 (limit 9), allowed because base was 16.02; any increase fails.',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });
  it('falls back to the finding message for a held metric without a held message', () => {
    const unmessaged = finding({
      rule: 'complexity',
      message: 'Function has a complexity of 12.',
      heldAtBase: 12,
      ratchet: { key: 'k', value: 12, worseMessage: 'grew from {base}' },
    });

    const summary = renderConsoleSummary(report({ unchangedFindings: [unmessaged] }), {
      color: false,
    });

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 finding still over a limit in touched code (not failing, not worse than before):',
        '  eslint/complexity src/a.js:12 Function has a complexity of 12. (allowed because base was 12; any increase fails)',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });
  it('says how many of a held lint finding there are now when fewer than at base', () => {
    const fewer = finding({
      rule: '@typescript-eslint/no-explicit-any',
      message: 'Unexpected any.',
      heldAtBase: 5,
      ratchet: { key: 'count:any', value: 3, existingCodeOnly: true },
    });

    const summary = renderConsoleSummary(report({ unchangedFindings: [fewer] }), {
      color: false,
    });

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 existing lint finding in edited code (not failing, no more than before):',
        '  eslint/@typescript-eslint/no-explicit-any src/a.js:12 Unexpected any. (5 at base, 3 now; any increase fails)',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });
  it('adds nothing when no finding was held', () => {
    const text = renderTextReport(report({ unchangedFindings: [untouched] }));
    const summary = renderConsoleSummary(report({ unchangedFindings: [untouched] }), {
      color: false,
    });

    expect(text).not.toContain('still over limit');
    expect(summary).not.toContain('Note:');
  });
});
