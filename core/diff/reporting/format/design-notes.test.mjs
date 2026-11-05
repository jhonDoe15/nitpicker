import { describe, expect, it } from 'vitest';
import { renderConsoleSummary } from '../summary.mjs';

const note = {
  tool: 'design',
  rule: 'foreign-state',
  path: 'src/orders.ts',
  identity: 'order',
  classification: 'descriptive',
  message: 'Review this boundary.\nKeep details in the report.',
  location: { line: 8 },
};

describe('design notes in the shared console summary', () => {
  it('lists only new descriptive findings after held lint and before errors', () => {
    const summary = renderConsoleSummary(
      {
        newFindings: [note],
        unchangedFindings: [
          {
            ...note,
            classification: 'enforceable',
            heldAtBase: 2,
            ratchet: { key: 'count', value: 2, existingCodeOnly: true },
          },
          { ...note, identity: 'old-note' },
        ],
        toolErrors: [{ tool: 'lint', message: 'Missing executable' }],
      },
      { color: false, diagnosticsPath: 'artifacts/report.txt' },
    );
    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        'No new enforceable violations, but the run is incomplete:',
        'Note: 1 existing lint finding in edited code (not failing, no more than before):',
        '  design/foreign-state src/orders.ts:8 Review this boundary. Keep details in the report. (2 at base and now; any increase fails)',
        'Design note for review (not failing): 1 new',
        '  design/foreign-state src/orders.ts:8 Review this boundary.',
        '✖ 1 tool error',
        '  lint: Missing executable',
        'Full diagnostics: artifacts/report.txt',
        '',
      ].join('\n'),
    );
  });

  it.each([
    ['No sentence terminator\n across lines', 'No sentence terminator across lines'],
    ['Could these be separate? More detail.', 'Could these be separate?'],
    ['Review `src/orders.ts` here. More detail.', 'Review `src/orders.ts` here.'],
    ['Split it, e.g. by feature. More detail.', 'Split it, e.g. by feature.'],
    ['Move it, i.e. out of shared. More detail.', 'Move it, i.e. out of shared.'],
    ['Keep version 1.2 here. More detail.', 'Keep version 1.2 here.'],
  ])('shows the first sentence without requiring a source location: %s', (message, sentence) => {
    expect(
      renderConsoleSummary(
        { newFindings: [{ ...note, message, location: undefined }], toolErrors: [] },
        { color: false },
      ),
    ).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Design note for review (not failing): 1 new',
        `  design/foreign-state src/orders.ts ${sentence}`,
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });

  it('lists rule notes before metric notes and shows the metric value', () => {
    const metric = { ...note, rule: 'module-coupling', message: 'fanIn for src/orders.ts' };
    expect(
      renderConsoleSummary(
        {
          newFindings: [{ ...metric, metric: { name: 'fanIn', value: 7 } }, note],
          toolErrors: [],
        },
        { color: false },
      ),
    ).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Design notes for review (not failing): 2 new',
        '  design/foreign-state src/orders.ts:8 Review this boundary.',
        '  design/module-coupling src/orders.ts:8 fanIn for src/orders.ts (fanIn 7)',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });
});
