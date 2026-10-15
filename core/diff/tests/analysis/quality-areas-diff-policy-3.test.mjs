import { describe, expect, it } from 'vitest';

import { compareFindings } from '../../comparison/compare.mjs';

import { normalizeStructure } from '../../../../languages/typescript/adapters/quality-areas/reporting/repository.mjs';

import { normalizeCrap } from '../../../../languages/typescript/adapters/quality-areas/reporting/tests.mjs';

import { rebaseMutationConfig } from '../../../../languages/typescript/adapters/quality-areas/runners/mutation.mjs';

describe('complete quality-area analyzer catalog', () => {
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
          'value CRAP rose from 9 to 9.5 (limit 9). Put new code in a new function and cover it with tests.',
        ratchet: {
          key: 'function:value:occurrence:1:crap',
          value: 9.5,
          worseMessage:
            'value CRAP rose from {base} to 9.5 (limit 9). Put new code in a new function and cover it with tests.',
          heldMessage:
            'value: CRAP 9.50 (limit 9), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
  });
  it('enforces oversized or deeply nested changed functions', () => {
    const findings = normalizeStructure(
      {
        functions: [
          {
            source: 'src/main/value.ts',
            function: 'value',
            sourceHash: 'changed-function',
            start: 1,
            end: 51,
            lines: 51,
            statements: 16,
            maxControlNesting: 3,
            parameters: 4,
          },
        ],
      },
      'structure',
    );

    expect(
      findings
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ rule }) => rule),
    ).toEqual([
      'function-lines-limit',
      'function-statements-limit',
      'function-control-nesting-limit',
      'function-parameters-limit',
    ]);
  });
  it('keeps anonymous structure identities stable when preceding lines move', () => {
    function findingsAt(start) {
      return normalizeStructure(
        {
          functions: [
            {
              source: 'src/main/callbacks.ts',
              function: '<anonymous>',
              sourceHash: 'unchanged-callback',
              start,
              end: start + 50,
              lines: 51,
              statements: 1,
              maxControlNesting: 0,
              parameters: 0,
            },
          ],
        },
        'structure',
      );
    }

    const comparison = compareFindings({
      baseFindings: findingsAt(10),
      headFindings: findingsAt(11),
    });

    expect(comparison.newFindings).toEqual([]);
    expect(comparison.resolvedFindings).toEqual([]);
  });
  it('rebases mutation companion configs into the analyzed snapshot', () => {
    expect(
      rebaseMutationConfig(
        {
          tsconfigFile: 'tsconfig.stryker.json',
          vitest: { configFile: 'stryker.vitest.config.ts', related: false },
        },
        {
          tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
          vitestConfigFile: '.nitpicker-diff-stryker.vitest.config.ts',
        },
      ),
    ).toEqual({
      tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
      vitest: {
        configFile: '.nitpicker-diff-stryker.vitest.config.ts',
        related: false,
      },
    });
  });
});
