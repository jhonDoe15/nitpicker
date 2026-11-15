import { describe, expect, it } from 'vitest';
import { fieldAt } from '../../../scripts/json/fields.mts';
import { fieldOf } from '../../../shared/values/readers.mts';
import { exceptionRoute } from '../../../shared/exceptions/rule-names.mjs';
import { namedReports as namedReportsJs } from '../snapshot-root/snapshot-root.mjs';
import { compareFindings } from './test-support/typed-compare.mts';
import {
  type ParsedFinding,
  type ParsedReport,
  parseFinding,
} from './test-support/parsed-findings.mts';

type Ratchet = Readonly<Record<string, unknown>> & {
  readonly worseMessage?: string;
  readonly worseAllowedForm?: string;
};

type Span = readonly [number, number];

const namedReports: (
  reports: Map<string, { readonly findings: readonly ParsedFinding[] }>,
  snapshotRoot: { readonly projectRoot: string; readonly snapshot: string },
) => Map<string, ParsedReport> = namedReportsJs;

function routeFor(rule: string, path: string, functionName?: string): string {
  return String(
    exceptionRoute({ rule, path, function: functionName, name: undefined, key: undefined }),
  );
}

const ROUTE = routeFor('nitpicker/no-throw', 'src/f.ts', 'f');
const OTHER_ROUTE = routeFor('nitpicker/no-throw', 'src/g.ts');

function finding({
  identity,
  line,
  value,
  message,
  allowedForm,
  ratchet = {},
}: {
  readonly identity: string;
  readonly line: number;
  readonly value: number;
  readonly message: string;
  readonly allowedForm?: string | undefined;
  readonly ratchet?: Readonly<Record<string, unknown>>;
}): ParsedFinding {
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

const edited = (ranges: readonly Span[], inserted: readonly Span[] = []) => ({
  changedLines: new Map([['src/f.ts', { added: false, ranges, inserted }]]),
  isStrictRule: () => true,
  mustMeetOnEditedLines: () => false,
});

describe('a finding the comparison rewrites', () => {
  const grown = (ratchet: Ratchet, allowedForm = 'Return a union.') =>
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

  it.each<[string, Ratchet, string | undefined]>([
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

    expect(findings.map((rewritten) => [rewritten, fieldOf(rewritten, 'allowedForm')])).toEqual(
      findings.map((rewritten) => [parseFinding(rewritten), allowedForm]),
    );
    expect(findings.map((rewritten) => fieldAt(rewritten, 'exception', 'paths'))).toEqual([
      [ratchet.worseMessage?.includes('src/g.ts') ? 'src/g.ts' : 'src/f.ts'],
    ]);
  });

  it('keeps its fields in step with growth advice', () => {
    const counted = (identity: string, line: number, value: number, allowedForm: string) =>
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
    expect(
      findings.map((rewritten) => [
        fieldOf(rewritten, 'message'),
        fieldOf(rewritten, 'allowedForm'),
      ]),
    ).toEqual([
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
    const [renamed] = reports.get('custom')?.findings ?? [];

    expect([renamed, fieldOf(renamed, 'message'), fieldOf(renamed, 'allowedForm')]).toEqual([
      parseFinding(renamed),
      'Could not read a.json. Delete a.json.',
      'Delete a.json.',
    ]);
  });
});
