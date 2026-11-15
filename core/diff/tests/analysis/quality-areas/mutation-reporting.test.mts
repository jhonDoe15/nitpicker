import { describe, expect, it } from 'vitest';
import { fieldAt } from '../../../../../scripts/json/fields.mts';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import type { MutationReport } from '../../../../../languages/typescript/adapters/quality-areas/typed/mutation.mts';
import { sourceSnippet } from '../../../../../languages/typescript/adapters/quality-areas/reporting/source-hashes.mts';
import {
  normalizeMutation,
  withUnreachedMutantsUncovered,
} from '../../../../../languages/typescript/adapters/quality-areas/reporting/tests.mts';
import { rebaseMutationConfig } from '../../../../../languages/typescript/adapters/quality-areas/runners/stryker/stryker-config.mts';

function isMutationReport(value: object): value is MutationReport {
  return 'files' in value;
}

describe('mutation reporting in the quality-area analyzers', () => {
  it('reports surviving mutants and status totals without gating on score', () => {
    const findings = normalizeMutation(
      {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Killed',
                mutatorName: 'ArithmeticOperator',
                replacement: '-',
                location: { start: { line: 2, column: 3 } },
              },
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line: 4, column: 5 } },
              },
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line: 4, column: 5 } },
              },
            ],
          },
        },
      },
      'mutation',
    );

    expect(findings).toEqual([
      {
        tool: 'mutation',
        rule: 'mutant-survived',
        path: 'src/main/value.ts',
        identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:1',
        message:
          'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        allowedForm:
          'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        location: { line: 4, column: 5 },
      },
      {
        tool: 'mutation',
        rule: 'mutant-survived',
        path: 'src/main/value.ts',
        identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:2',
        message:
          'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        allowedForm:
          'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        location: { line: 4, column: 5 },
      },
      {
        tool: 'mutation',
        rule: 'mutation-summary',
        path: '.',
        identity: 'status:Killed',
        message: 'Killed mutants',
        classification: 'descriptive',
        metric: { name: 'Killed', value: 1 },
      },
      {
        tool: 'mutation',
        rule: 'mutation-summary',
        path: '.',
        identity: 'status:Survived',
        message: 'Survived mutants',
        classification: 'descriptive',
        metric: { name: 'Survived', value: 2 },
      },
    ]);
    expect(findings).toEqual([
      {
        tool: 'mutation',
        rule: 'mutant-survived',
        path: 'src/main/value.ts',
        identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:1',
        message:
          'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        allowedForm:
          'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        location: { line: 4, column: 5 },
      },
      {
        tool: 'mutation',
        rule: 'mutant-survived',
        path: 'src/main/value.ts',
        identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:2',
        message:
          'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        allowedForm:
          'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        location: { line: 4, column: 5 },
      },
      {
        tool: 'mutation',
        rule: 'mutation-summary',
        path: '.',
        identity: 'status:Killed',
        message: 'Killed mutants',
        classification: 'descriptive',
        metric: { name: 'Killed', value: 1 },
      },
      {
        tool: 'mutation',
        rule: 'mutation-summary',
        path: '.',
        identity: 'status:Survived',
        message: 'Survived mutants',
        classification: 'descriptive',
        metric: { name: 'Survived', value: 2 },
      },
    ]);
    expect(findings).toEqual([
      {
        tool: 'mutation',
        rule: 'mutant-survived',
        path: 'src/main/value.ts',
        identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:1',
        message:
          'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        allowedForm:
          'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        location: { line: 4, column: 5 },
      },
      {
        tool: 'mutation',
        rule: 'mutant-survived',
        path: 'src/main/value.ts',
        identity: 'BooleanLiteral|fcbcf165908dd18a9e49f7ff|42fa055d09edd207663e69f0|occurrence:2',
        message:
          'Survived BooleanLiteral at column 5: replacing this code with `false` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        allowedForm:
          'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        classification: 'enforceable',
        location: { line: 4, column: 5 },
      },
      {
        tool: 'mutation',
        rule: 'mutation-summary',
        path: '.',
        identity: 'status:Killed',
        message: 'Killed mutants',
        classification: 'descriptive',
        metric: { name: 'Killed', value: 1 },
      },
      {
        tool: 'mutation',
        rule: 'mutation-summary',
        path: '.',
        identity: 'status:Survived',
        message: 'Survived mutants',
        classification: 'descriptive',
        metric: { name: 'Survived', value: 2 },
      },
    ]);
    const survivingMutants = findings.filter(({ rule }) => rule === 'mutant-survived');
    expect(new Set(survivingMutants.map(({ identity }) => identity)).size).toBe(2);
  });
  it('carries the mutant column and original code into the message and location', () => {
    const findings = normalizeMutation(
      {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Survived',
                mutatorName: 'ConditionalExpression',
                replacement: 'true',
                original: 'a > b',
                location: { start: { line: 4, column: 15 } },
              },
            ],
          },
        },
      },
      'mutation',
    ).filter(({ rule }) => rule === 'mutant-survived');

    expect(fieldAt(findings, 0, 'location')).toEqual({ line: 4, column: 15 });
    expect(fieldAt(findings, 0, 'message')).toBe(
      'Survived ConditionalExpression at column 15: replacing `a > b` with `true` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
    );
  });
  it('cuts the mutated code out of the source by 1-based Stryker positions', () => {
    const source = 'const a = 1;\nreturn a > 2 && a < 9;\n';
    const at = (line: number, column: number) => ({ line, column });

    expect(sourceSnippet(source, { start: at(2, 8), end: at(2, 13) })).toBe('a > 2');
    expect(sourceSnippet(source, { start: at(1, 11), end: at(2, 7) })).toBe('1;\nreturn');
    expect(sourceSnippet(source, { start: at(9, 1), end: at(9, 2) })).toBeUndefined();
  });
  it('keeps mutant identities stable when source positions move', () => {
    function reportAt(line: number) {
      return {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line, column: 5 } },
              },
            ],
          },
        },
      };
    }

    const before = normalizeMutation(reportAt(4), 'mutation');
    const after = normalizeMutation(reportAt(40), 'mutation');

    expect(before.find(({ rule }) => rule === 'mutant-survived')?.identity).toBe(
      after.find(({ rule }) => rule === 'mutant-survived')?.identity,
    );
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

describe('mutants of a run whose tests reach no mutated module', () => {
  function reportOf(...mutants: readonly object[]): MutationReport {
    const report: object = { files: { 'src/lonely.ts': { mutants } } };
    if (!isMutationReport(report)) {
      throw new TypeError('not a mutation report');
    }
    return report;
  }

  function mutant(status: string, coveredBy?: readonly string[]): object {
    return { id: status, status, ...(coveredBy === undefined ? {} : { coveredBy }) };
  }

  function statusesOf(report: MutationReport): unknown[] {
    return listOf(fieldAt(report, 'files', 'src/lonely.ts', 'mutants')).map((entry) =>
      fieldOf(entry, 'status'),
    );
  }

  it('are reported as not covered when the dry run collected no coverage at all', () => {
    const report = withUnreachedMutantsUncovered(
      reportOf(mutant('Survived'), mutant('Survived'), mutant('CompileError')),
      'perTest',
    );

    expect(fieldAt(report, 'files', 'src/lonely.ts', 'mutants')).toEqual([
      { id: 'Survived', status: 'NoCoverage', coveredBy: [] },
      { id: 'Survived', status: 'NoCoverage', coveredBy: [] },
      { id: 'CompileError', status: 'CompileError' },
    ]);
  });

  it.each([
    ['the run has coverage for some mutant', [mutant('Survived'), mutant('Survived', ['0'])]],
    ['a test killed a mutant', [mutant('Survived'), mutant('Killed')]],
    ['a test timed out on a mutant', [mutant('Survived'), mutant('Timeout')]],
    ['coverage analysis is off', [mutant('Survived')], 'off'],
  ])(
    'keep their status when %s',
    (_case: string, mutants: readonly object[], coverageAnalysis = 'perTest') => {
      expect(
        statusesOf(withUnreachedMutantsUncovered(reportOf(...mutants), coverageAnalysis)),
      ).toEqual(mutants.map((entry) => fieldOf(entry, 'status')));
    },
  );
});
