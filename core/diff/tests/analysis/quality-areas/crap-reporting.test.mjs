import { describe, expect, it } from 'vitest';
import {
  applyThresholds,
  configuredAnalyzers,
} from '../../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../../../shared/policy.mjs';
import { hashFiles } from '../../../../../languages/typescript/preset/checks/hash.mjs';
import { compareFindings } from '../../../comparison/compare.mjs';
import { normalizeCrap } from '../../../../../languages/typescript/adapters/quality-areas/reporting/tests.mjs';

const packageAnalyzers = configuredAnalyzers();
describe('CRAP reporting in the quality-area analyzers', () => {
  it('assigns repeated CRAP symbols by source order instead of report rank', () => {
    function functionEntry(line, crap) {
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
    function identityAt(findings, line) {
      return findings.find(
        ({ rule, metric, location }) =>
          rule === 'function-crap' && metric.name === 'complexity' && location.line === line,
      )?.identity;
    }

    expect(identityAt(first, 10)).toBe(identityAt(second, 10));
    expect(identityAt(first, 40)).toBe(identityAt(second, 40));
  });
  it('enforces CRAP scores at 9 or higher and unknown coverage', () => {
    function functionEntry(crap, sourceHash) {
      return {
        source: 'src/main/value.ts',
        function: 'value',
        sourceHash,
        lines: { start: 1, end: 3 },
        complexity: 1,
        statementCoverage: { percent: crap === null ? null : 100 },
        branchCoverage: { percent: crap === null ? null : 100 },
        effectiveCoverage: { percent: crap === null ? null : 100 },
        crap,
      };
    }

    expect(normalizeCrap({ functions: [functionEntry(8.99, 'safe')] }, 'crap')).not.toContainEqual(
      expect.objectContaining({ classification: 'enforceable' }),
    );
    expect(normalizeCrap({ functions: [functionEntry(9, 'limit')] }, 'crap')).toEqual([
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
        location: { line: 1 },
        ratchet: {
          key: 'function:value:occurrence:1:crap',
          value: 9,
          worseMessage:
            'value CRAP rose from {base} to 9 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
          worseAllowedForm: 'Put new code in a new function and cover it with tests.',
          heldMessage:
            'value: CRAP 9.00 (limit 9), allowed because base was {base}; any increase fails.',
        },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:complexity',
        message: 'complexity for value',
        classification: 'descriptive',
        metric: { name: 'complexity', value: 1 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:statementCoverage',
        message: 'statementCoverage for value',
        classification: 'descriptive',
        metric: { name: 'statementCoverage', value: 100 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:branchCoverage',
        message: 'branchCoverage for value',
        classification: 'descriptive',
        metric: { name: 'branchCoverage', value: 100 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:effectiveCoverage',
        message: 'effectiveCoverage for value',
        classification: 'descriptive',
        metric: { name: 'effectiveCoverage', value: 100 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:crap',
        message: 'crap for value',
        classification: 'descriptive',
        metric: { name: 'crap', value: 9 },
        symbol: 'value',
        location: { line: 1 },
      },
    ]);
    expect(normalizeCrap({ functions: [functionEntry(null, 'unknown')] }, 'crap')).toEqual([
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
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:complexity',
        message: 'complexity for value',
        classification: 'descriptive',
        metric: { name: 'complexity', value: 1 },
        symbol: 'value',
        location: { line: 1 },
      },
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
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:complexity',
        message: 'complexity for value',
        classification: 'descriptive',
        metric: { name: 'complexity', value: 1 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:statementCoverage',
        message: 'statementCoverage for value',
        classification: 'descriptive',
        metric: { name: 'statementCoverage', value: 100 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:branchCoverage',
        message: 'branchCoverage for value',
        classification: 'descriptive',
        metric: { name: 'branchCoverage', value: 100 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:effectiveCoverage',
        message: 'effectiveCoverage for value',
        classification: 'descriptive',
        metric: { name: 'effectiveCoverage', value: 100 },
        symbol: 'value',
        location: { line: 1 },
      },
    ]);
  });
  it('uses 9 by default and takes an explicit CRAP limit from the config thresholds', () => {
    expect(DEFAULT_CRAP_SCORE_LIMIT).toBe(9);
    const [configured] = applyThresholds(
      packageAnalyzers.filter(({ name }) => name === 'crap'),
      { crapLimit: 12 },
    );
    const invocation = configured.createInvocation({
      projectRoot: '/project',
      policyRoot: '/policy',
      toolRoot: '/tools',
      snapshot: 'head',
    });
    expect(invocation.args.slice(-2)).toEqual(['--crap-score-limit', '12']);
    const defaultCrap = packageAnalyzers.find(({ name }) => name === 'crap');
    expect(configured.configurationHash).not.toBe(defaultCrap.configurationHash);
    expect(typeof configured.resolveVersion).toBe('function');
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
    function functionEntry(crap) {
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
        location: { line: 1 },
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
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:complexity',
        message: 'complexity for value',
        classification: 'descriptive',
        metric: { name: 'complexity', value: 2 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:statementCoverage',
        message: 'statementCoverage for value',
        classification: 'descriptive',
        metric: { name: 'statementCoverage', value: 100 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:branchCoverage',
        message: 'branchCoverage for value',
        classification: 'descriptive',
        metric: { name: 'branchCoverage', value: 100 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:effectiveCoverage',
        message: 'effectiveCoverage for value',
        classification: 'descriptive',
        metric: { name: 'effectiveCoverage', value: 100 },
        symbol: 'value',
        location: { line: 1 },
      },
      {
        tool: 'crap',
        rule: 'function-crap',
        path: 'src/main/value.ts',
        identity: 'function:value:occurrence:1:crap',
        message: 'crap for value',
        classification: 'descriptive',
        metric: { name: 'crap', value: 12 },
        symbol: 'value',
        location: { line: 1 },
      },
    ]);
  });
  it('reactivates excessive CRAP only when the function source changes and the score rises', () => {
    function crapFindingsFor(sourceHash, crap = 9) {
      return normalizeCrap(
        {
          functions: [
            {
              source: 'src/main/value.ts',
              function: 'value',
              sourceHash,
              lines: { start: 1, end: 3 },
              complexity: 9,
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
    const newFindingsFor = (headFindings) =>
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
        location: { line: 1 },
        classification: 'enforceable',
        message:
          'value CRAP rose from 9 to 9.5 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/main/value.ts"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Put new code in a new function and cover it with tests.',
        ratchet: {
          key: 'function:value:occurrence:1:crap',
          value: 9.5,
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
