import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestPit } from '../../../../languages/java/ingest/pit.mjs';
import { ingestMutmut } from '../../../../languages/python/ingest/mutmut.mjs';
import { normalizeMutation } from '../../../../languages/typescript/adapters/quality-areas/reporting/tests.mjs';
import { json } from '../reporters.mjs';
import { renderConsoleSummary } from '../summary.mjs';
import { foldMutants } from './mutants.mjs';

const recordedMutmutRun = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, '../../../../languages/python/ingest/fixtures/mutmut-run.json'),
    'utf8',
  ),
);

function enforceable(findings) {
  return findings.filter(({ classification }) => classification === 'enforceable');
}

function summaryOf(findings) {
  return renderConsoleSummary({ newFindings: findings, toolErrors: [] }, { color: false });
}

function mutantEntries(summary) {
  return summary
    .split('\n')
    .filter((line) => line.startsWith('  '))
    .join('\n');
}

function strykerMutant(status, line, functionName = 'price') {
  return {
    status,
    mutatorName: 'ArithmeticOperator',
    replacement: `value - ${String(line)}`,
    original: `value + ${String(line)}`,
    ...(functionName === null ? {} : { functionName }),
    location: { start: { line, column: 3 } },
  };
}

function pitMutation(status, line, method = 'total') {
  return `<mutation detected='false' status='${status}'><sourceFile>Cart.java</sourceFile><mutatedClass>shop.Cart</mutatedClass><mutatedMethod>${method}</mutatedMethod><methodDescription>(Ljava/util/List;)I</methodDescription><lineNumber>${String(line)}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator><description>Replaced integer addition with subtraction ${String(line)}</description></mutation>`;
}

describe('mutation entries in the console summary', () => {
  it('prints one entry per function for Stryker mutants no test runs', () => {
    const findings = normalizeMutation(
      {
        files: {
          'src/pricing.ts': {
            mutants: [4, 5, 7, 9].map((line) => strykerMutant('NoCoverage', line)),
          },
        },
      },
      'mutation',
    );

    expect(mutantEntries(summaryOf(findings))).toEqual(
      [
        '  mutation/mutant-nocoverage src/pricing.ts:4',
        '    price: 4 mutants on lines 4 to 9 that no test runs. Add a test that reaches this code.',
      ].join('\n'),
    );
  });

  it('prints three survivors of a Stryker function and counts the rest', () => {
    const findings = normalizeMutation(
      {
        files: {
          'src/pricing.ts': {
            mutants: [2, 3, 4, 5, 6].map((line) => strykerMutant('Survived', line)),
          },
        },
      },
      'mutation',
    );

    const entries = mutantEntries(summaryOf(findings)).split('\n');
    expect(entries.filter((line) => line.includes('fails no test'))).toHaveLength(3);
    expect(entries.slice(-2)).toEqual([
      '  mutation/mutant-survived src/pricing.ts',
      '    and 2 more surviving mutants in price (listed in the diagnostics file)',
    ]);
  });

  it('folds PIT mutants per method and drops the descriptor from the name', () => {
    const xml = `<mutations>${[
      pitMutation('NO_COVERAGE', 11, 'discount'),
      pitMutation('NO_COVERAGE', 12, 'discount'),
      pitMutation('NO_COVERAGE', 14, 'discount'),
      ...[3, 4, 5, 6, 7].map((line) => pitMutation('SURVIVED', line)),
    ].join('')}</mutations>`;
    const findings = enforceable(
      ingestPit(xml, { resolvePath: () => 'src/main/java/shop/Cart.java' }).findings,
    );

    const entries = mutantEntries(summaryOf(findings)).split('\n');
    expect(entries).toContain(
      '    Cart#discount: 3 mutants on lines 11 to 14 that no test runs. Add a test that reaches this code.',
    );
    expect(entries).toContain(
      '    and 2 more surviving mutants in Cart#total (listed in the diagnostics file)',
    );
    expect(entries.filter((line) => line.includes('Survived MathMutator'))).toHaveLength(3);
  });

  it('folds the mutmut mutants of a recorded run per function', () => {
    const findings = enforceable(ingestMutmut(recordedMutmutRun).findings);

    const entries = mutantEntries(summaryOf(findings)).split('\n');
    expect(entries.filter((line) => line.includes('fails no test'))).toHaveLength(3);
    expect(entries.slice(6)).toEqual([
      '  mutmut/mutant-survived src/shop/pricing.py',
      '    and 2 more surviving mutants in total (listed in the diagnostics file)',
      '  mutmut/mutant-nocoverage src/shop/pricing.py:28',
      '    Cart.label: 7 mutants on line 28 that no test runs. Add a test that reaches this code.',
      '  mutmut/mutant-nocoverage src/shop/pricing.py:39',
      '    fetch: 2 mutants on line 39 that no test runs. Add a test that reaches this code.',
      '  mutmut/mutant-nocoverage src/shop/pricing.py:43',
      '    never_called: 8 mutants on line 43 that no test runs. Add a test that reaches this code.',
    ]);
  });

  it('keeps covered survivors and folds the unreached mutants of the same function', () => {
    const findings = normalizeMutation(
      {
        files: {
          'src/pricing.ts': {
            mutants: [
              strykerMutant('Survived', 2),
              strykerMutant('NoCoverage', 6),
              strykerMutant('Survived', 3),
              strykerMutant('NoCoverage', 8),
            ],
          },
        },
      },
      'mutation',
    );

    const entries = mutantEntries(summaryOf(findings)).split('\n');
    expect(entries[0]).toBe('  mutation/mutant-nocoverage src/pricing.ts:6');
    expect(entries[1]).toBe(
      '    price: 2 mutants on lines 6 to 8 that no test runs. Add a test that reaches this code.',
    );
    expect(entries.slice(2).filter((line) => line.includes('fails no test'))).toHaveLength(2);
    expect(entries.join('\n')).not.toContain('more surviving');
  });

  it('keeps a single unreached mutant as it is and folds per function, not per file', () => {
    const findings = normalizeMutation(
      {
        files: {
          'src/pricing.ts': {
            mutants: [
              strykerMutant('NoCoverage', 2, 'price'),
              strykerMutant('NoCoverage', 6, 'total'),
              strykerMutant('NoCoverage', 7, 'total'),
              strykerMutant('NoCoverage', 1, null),
              strykerMutant('NoCoverage', 9, null),
            ],
          },
        },
      },
      'mutation',
    );

    const entries = mutantEntries(summaryOf(findings)).split('\n');
    expect(entries).toContain(
      '    NoCoverage ArithmeticOperator at column 3: no test runs this code. Add a test that reaches it.',
    );
    expect(entries).toContain(
      '    total: 2 mutants on lines 6 to 7 that no test runs. Add a test that reaches this code.',
    );
    expect(entries).toContain(
      '    top-level code: 2 mutants on lines 1 to 9 that no test runs. Add a test that reaches this code.',
    );
  });

  it('keeps the headline count, the other findings and the findings themselves as they are', () => {
    const lint = {
      tool: 'eslint',
      rule: 'no-console',
      path: 'src/pricing.ts',
      message: 'Unexpected console statement.',
      classification: 'enforceable',
      location: { line: 1 },
    };
    const mutants = normalizeMutation(
      {
        files: {
          'src/pricing.ts': {
            mutants: [2, 3, 4, 5, 6, 7].map((line) => strykerMutant('NoCoverage', line)),
          },
        },
      },
      'mutation',
    );
    const findings = [lint, ...enforceable(mutants)];
    const written = json(findings);

    const summary = summaryOf(findings);

    expect(summary).toContain('✖ 7 new enforceable violations');
    expect(summary).toContain(
      '  eslint/no-console src/pricing.ts:1\n    Unexpected console statement.',
    );
    expect(json(findings)).toBe(written);
    expect(foldMutants(findings)).toHaveLength(2);
  });
});
