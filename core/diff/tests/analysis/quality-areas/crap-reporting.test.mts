import { describe, expect, it } from 'vitest';
import {
  applyThresholds as applyThresholdsJs,
  configuredAnalyzers,
} from '../../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../../../shared/policy.mjs';
import { hashFiles } from '../../../../../languages/typescript/preset/checks/hash.mjs';
import { compareFindings } from '../../../comparison/test-support/typed-compare.mts';
import { fieldOf, parseJson } from '../../../../../shared/values/readers.mts';
import { fieldAt } from '../../../../../scripts/json/fields.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import type { CrapEntry } from '../../../../../languages/typescript/adapters/quality-areas/typed/reporting.mts';
import { normalizeCrap } from '../../../../../languages/typescript/adapters/quality-areas/reporting/tests.mts';

type CrapAnalyzer = {
  readonly name: string;
  readonly configurationHash: unknown;
  readonly resolveVersion: unknown;
  readonly createInvocation: (context: {
    readonly projectRoot: string;
    readonly policyRoot: string;
    readonly toolRoot: string;
    readonly snapshot: string;
  }) => { readonly args: readonly string[] };
};

const catalog: () => CrapAnalyzer[] = configuredAnalyzers;
const applyThresholds: (
  analyzers: CrapAnalyzer[],
  thresholds: { readonly crapLimit: number },
) => CrapAnalyzer[] = applyThresholdsJs;
const packageAnalyzers = catalog();

function isCrapEntry(value: unknown): value is CrapEntry {
  return typeof fieldOf(value, 'source') === 'string';
}
function descriptive(name: string, value: number) {
  return {
    tool: 'crap',
    rule: 'function-crap',
    path: 'src/main/value.ts',
    identity: `function:value:occurrence:1:${name}`,
    message: `${name} for value`,
    classification: 'descriptive',
    metric: { name, value },
    symbol: 'value',
    location: { line: 1 },
  };
}
const fullCoverage = [
  descriptive('statementCoverage', 100),
  descriptive('branchCoverage', 100),
  descriptive('effectiveCoverage', 100),
];
const heldCrap: unknown = expect.closeTo(9.5, 10);
describe('CRAP reporting in the quality-area analyzers', () => {
  it('assigns repeated CRAP symbols by source order instead of report rank', () => {
    function functionEntry(line: number, crap: number): CrapEntry {
      return {
        source: 'src/main/value.ts',
        function: 'constructor',
        lines: { start: line, end: line + 2 },
        complexity: 1,
        statementCoverage: { percent: 100 },
        branchCoverage: { percent: 100 },
        effectiveCoverage: { percent: 100 },
        crap,
      };
    }

    const first = normalizeCrap(
      { functions: [functionEntry(40, 10), functionEntry(10, 1)] },
      'crap',
    );
    const second = normalizeCrap(
      { functions: [functionEntry(10, 20), functionEntry(40, 2)] },
      'crap',
    );
    function identityAt(findings: readonly Finding[], line: number): unknown {
      return findings.find(
        (finding) =>
          finding.rule === 'function-crap' &&
          fieldAt(finding, 'metric', 'name') === 'complexity' &&
          fieldAt(finding, 'location', 'line') === line,
      )?.identity;
    }

    expect(identityAt(first, 10)).toBe(identityAt(second, 10));
    expect(identityAt(first, 40)).toBe(identityAt(second, 40));
  });
  it('enforces CRAP scores at 9 or higher and unknown coverage', () => {
    function functionEntry(
      crap: number | 'unknown-coverage' | undefined,
      sourceHash: string,
    ): CrapEntry {
      const unknownCoverage = crap === 'unknown-coverage';
      const percent = unknownCoverage ? null : 100;
      const entry = parseJson(
        JSON.stringify({
          source: 'src/main/value.ts',
          function: 'value',
          sourceHash,
          lines: { start: 1, end: 3 },
          complexity: 1,
          statementCoverage: { percent },
          branchCoverage: { percent },
          effectiveCoverage: { percent },
          crap: unknownCoverage ? null : crap,
        }),
      );
      if (!isCrapEntry(entry)) {
        throw new TypeError('not a CRAP entry');
      }
      return entry;
    }

    expect(normalizeCrap({ functions: [functionEntry(8.99, 'safe')] }, 'crap')).not.toContainEqual(
      expect.objectContaining({ classification: 'enforceable' }),
    );
    expect(
      normalizeCrap({ functions: [functionEntry(DEFAULT_CRAP_SCORE_LIMIT, 'limit')] }, 'crap'),
    ).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:source:limit',
        message:
          'value has CRAP 9.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Test its uncovered branches, or split a branchy part into its own function.',
        classification: 'enforceable',
        symbol: 'value',
        location: { line: 1, endLine: 3 },
        ratchet: {
          key: 'function:value:occurrence:1:crap',
          value: DEFAULT_CRAP_SCORE_LIMIT,
          worseMessage:
            'value CRAP rose from {base} to 9 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
          worseAllowedForm: 'Put new code in a new function and cover it with tests.',
          heldMessage:
            'value: CRAP 9.00 (limit 9), allowed because base was {base}; any increase fails.',
        },
      },
      descriptive('complexity', 1),
      ...fullCoverage,
      descriptive('crap', DEFAULT_CRAP_SCORE_LIMIT),
    ]);
    expect(
      normalizeCrap({ functions: [functionEntry('unknown-coverage', 'unknown')] }, 'crap'),
    ).toEqual([
      {
        tool: 'crap',
        rule: 'crap-coverage-unknown',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:source:unknown',
        message:
          'value has unknown coverage and no CRAP score: no test runs it. Add a test that calls it. If this is intended, add {"rule":"crap-coverage-unknown","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Add a test that calls it.',
        classification: 'enforceable',
        symbol: 'value',
        location: { line: 1, endLine: 3 },
      },
      descriptive('complexity', 1),
    ]);
    expect(normalizeCrap({ functions: [functionEntry(undefined, 'missing')] }, 'crap')).toEqual([
      {
        tool: 'crap',
        rule: 'crap-coverage-unknown',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:source:missing',
        message:
          'value has unknown coverage and no CRAP score: no test runs it. Add a test that calls it. If this is intended, add {"rule":"crap-coverage-unknown","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Add a test that calls it.',
        classification: 'enforceable',
        symbol: 'value',
        location: { line: 1, endLine: 3 },
      },
      descriptive('complexity', 1),
      ...fullCoverage,
    ]);
  });
  it('uses 9 by default and takes an explicit CRAP limit from the config thresholds', () => {
    expect(DEFAULT_CRAP_SCORE_LIMIT).toBe(9);
    const [configured] = applyThresholds(
      packageAnalyzers.filter(({ name }) => name === 'crap'),
      { crapLimit: 12 },
    );
    const invocation = configured?.createInvocation({
      projectRoot: '/project',
      policyRoot: '/policy',
      toolRoot: '/tools',
      snapshot: 'head',
    });
    expect(invocation?.args.slice(-2)).toEqual(['--crap-score-limit', '12']);
    const defaultCrap = packageAnalyzers.find(({ name }) => name === 'crap');
    expect(configured?.configurationHash).not.toBe(defaultCrap?.configurationHash);
    expect(typeof configured?.resolveVersion).toBe('function');
  });
  it('includes the active CRAP limit in the configuration hash', () => {
    expect(
      hashFiles(
        ['languages/typescript/preset/defaults/crap.config.mjs'],
        ['--crap-score-limit', '9'],
      ),
    ).not.toBe(
      hashFiles(
        ['languages/typescript/preset/defaults/crap.config.mjs'],
        ['--crap-score-limit', '12'],
      ),
    );
  });
  it('allows CRAP scores to vary below an explicit limit', () => {
    function functionEntry(crap: number): CrapEntry {
      return {
        source: 'src/main/value.ts',
        function: 'value',
        sourceHash: 'changed',
        lines: { start: 1, end: 3 },
        complexity: 2,
        statementCoverage: { percent: 100 },
        branchCoverage: { percent: 100 },
        effectiveCoverage: { percent: 100 },
        crap,
      };
    }

    const baseFindings = normalizeCrap({ functions: [functionEntry(10)] }, 'crap', {
      scoreLimit: 12,
    });
    const headFindings = normalizeCrap({ functions: [functionEntry(11.99)] }, 'crap', {
      scoreLimit: 12,
    });
    expect(compareFindings({ baseFindings, headFindings }).newFindings).toEqual([]);
    expect(
      normalizeCrap({ functions: [functionEntry(12)] }, 'crap', {
        scoreLimit: 12,
      }),
    ).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:source:changed',
        message:
          'value has CRAP 12.00; score must be below 12. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Test its uncovered branches, or split a branchy part into its own function.',
        classification: 'enforceable',
        symbol: 'value',
        location: { line: 1, endLine: 3 },
        ratchet: {
          key: 'function:value:occurrence:1:crap',
          value: 12,
          worseMessage:
            'value CRAP rose from {base} to 12 (limit 12). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
          worseAllowedForm: 'Put new code in a new function and cover it with tests.',
          heldMessage:
            'value: CRAP 12.00 (limit 12), allowed because base was {base}; any increase fails.',
        },
      },
      descriptive('complexity', 2),
      ...fullCoverage,
      descriptive('crap', 12),
    ]);
  });
  it('reactivates excessive CRAP only when the function source changes and the score rises', () => {
    function crapFindingsFor(sourceHash: string, crap = DEFAULT_CRAP_SCORE_LIMIT) {
      return normalizeCrap(
        {
          functions: [
            {
              source: 'src/main/value.ts',
              function: 'value',
              sourceHash,
              lines: { start: 1, end: 3 },
              complexity: DEFAULT_CRAP_SCORE_LIMIT,
              statementCoverage: { percent: 100 },
              branchCoverage: { percent: 100 },
              effectiveCoverage: { percent: 100 },
              crap,
            },
          ],
        },
        'crap',
      );
    }
    const base = crapFindingsFor('base');
    const newFindingsFor = (headFindings: readonly Finding[]) =>
      compareFindings({ baseFindings: base, headFindings }).newFindings;

    expect(newFindingsFor(crapFindingsFor('base'))).toEqual([]);
    expect(newFindingsFor(crapFindingsFor('changed'))).toEqual([]);
    expect(newFindingsFor(crapFindingsFor('changed', 8))).toEqual([]);
    expect(newFindingsFor(crapFindingsFor('changed', 9.5))).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        path: 'src/main/value.ts',
        symbol: 'value',
        identity: 'function:value:occurrence:1:source:changed',
        location: { line: 1, endLine: 3 },
        classification: 'enforceable',
        message:
          'value CRAP rose from 9 to 9.5 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Put new code in a new function and cover it with tests.',
        exception: {
          rule: 'crap-score-limit',
          paths: ['src/main/value.ts'],
          function: 'value',
          reason: '...',
        },
        exceptionList: 'exceptions',
        ratchet: {
          key: 'function:value:occurrence:1:crap',
          value: heldCrap,
          worseMessage:
            'value CRAP rose from {base} to 9.5 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
          worseAllowedForm: 'Put new code in a new function and cover it with tests.',
          heldMessage:
            'value: CRAP 9.50 (limit 9), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
  });
});
