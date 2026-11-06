import { describe, expect, it } from 'vitest';
import { exceptionRoute } from '../../../shared/exceptions/rule-names.mjs';
import { namedReports } from '../snapshot-root/snapshot-root.mjs';
import { compareFindings } from './compare.mjs';
import { parseFinding } from './finding-schema.mjs';

const ROUTE = exceptionRoute({ rule: 'nitpicker/no-throw', path: 'src/f.ts', function: 'f' });
const OTHER_ROUTE = exceptionRoute({ rule: 'nitpicker/no-throw', path: 'src/g.ts' });

function finding({ identity, line, value, message, allowedForm, ratchet = {} }) {
  return parseFinding({
    tool: 'eslint',
    rule: 'nitpicker/no-throw',
    path: 'src/f.ts',
    identity,
    message,
    ...(allowedForm === undefined ? {} : { allowedForm }),
    classification: 'enforceable',
    symbol: 'f',
    location: { line },
    ratchet: { key: 'count:noThrow', value, ...ratchet },
  });
}

const edited = (ranges, inserted = []) => ({
  changedLines: new Map([['src/f.ts', { added: false, ranges, inserted }]]),
  isStrictRule: () => true,
  mustMeetOnEditedLines: () => false,
});

describe('a finding the comparison rewrites', () => {
  const grown = (ratchet, allowedForm = 'Return a union.') =>
    compareFindings({
      baseFindings: [
        finding({ identity: 'a', line: 4, value: 1, message: `Do not throw. ${ROUTE}`, ratchet }),
      ],
      headFindings: [
        finding({
          identity: 'b',
          line: 4,
          value: 2,
          message: `Do not throw. Return a union. ${ROUTE}`,
          allowedForm,
          ratchet,
        }),
      ],
      touchedCode: { ...edited([]), isStrictRule: () => false },
    }).newFindings;

  it.each([
    [
      'a worse message with its own allowed form',
      { worseMessage: `Grew from {base}. Split it. ${OTHER_ROUTE}`, worseAllowedForm: 'Split it.' },
      'Split it.',
    ],
    [
      'a worse message that keeps the allowed form',
      { worseMessage: `Grew from {base}. Return a union. ${ROUTE}` },
      'Return a union.',
    ],
    [
      'a worse message that drops the allowed form',
      { worseMessage: `Grew from {base}. ${OTHER_ROUTE}` },
      undefined,
    ],
  ])('keeps its fields in step with %s', (_name, ratchet, allowedForm) => {
    const findings = grown(ratchet);

    expect(findings.map((rewritten) => [rewritten, rewritten.allowedForm])).toEqual(
      findings.map((rewritten) => [parseFinding(rewritten), allowedForm]),
    );
    expect(findings.map(({ exception }) => exception.paths)).toEqual([
      [ratchet.worseMessage.includes('src/g.ts') ? 'src/g.ts' : 'src/f.ts'],
    ]);
  });

  it('keeps its fields in step with growth advice', () => {
    const counted = (identity, line, value, allowedForm) =>
      finding({
        identity,
        line,
        value,
        message: `Do not throw. Return a union. ${ROUTE}`,
        allowedForm,
        ratchet: {
          existingCodeOnly: true,
          growthAdvice: 'Keep to it. The base had {base}.',
          growthAllowedForm: 'Keep to it.',
        },
      });
    const findings = compareFindings({
      baseFindings: [counted('first', 4, 1, 'Return a union.')],
      headFindings: [
        counted('first', 4, 2, 'Return a union.'),
        counted('added', 6, 2, 'Return a union.'),
      ],
      touchedCode: edited([[6, 6]], [[6, 6]]),
    }).newFindings;

    expect(findings).toEqual(findings.map((rewritten) => parseFinding(rewritten)));
    expect(findings.map(({ message, allowedForm }) => [message, allowedForm])).toEqual([
      [
        `Do not throw. Return a union. Keep to it. The base had 1. ${ROUTE}`,
        'Return a union. Keep to it.',
      ],
    ]);
  });
});

describe('a tool error the run renames', () => {
  it('keeps its fields in step when the snapshot root leaves its text', () => {
    const snapshotRoot = { projectRoot: '/tmp/snapshot-head', snapshot: 'head' };
    const reports = namedReports(
      new Map([
        [
          'custom',
          {
            findings: [
              parseFinding({
                tool: 'custom',
                rule: 'crashed',
                path: '.',
                identity: 'crash',
                message:
                  'Could not read /tmp/snapshot-head/a.json. Delete /tmp/snapshot-head/a.json.',
                allowedForm: 'Delete /tmp/snapshot-head/a.json.',
                classification: 'tool-error',
              }),
            ],
          },
        ],
      ]),
      snapshotRoot,
    );
    const [renamed] = reports.get('custom').findings;

    expect([renamed, renamed.message, renamed.allowedForm]).toEqual([
      parseFinding(renamed),
      'Could not read a.json. Delete a.json.',
      'Delete a.json.',
    ]);
  });
});
