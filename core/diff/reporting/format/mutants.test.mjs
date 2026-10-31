import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestPit } from '../../../../languages/java/ingest/pit.mjs';
import { ingestMutmut } from '../../../../languages/python/ingest/mutmut.mjs';
import { normalizeMutation } from '../../../../languages/typescript/adapters/quality-areas/reporting/tests.mjs';
import { json } from '../reporters.mjs';
import { renderConsoleSummary } from '../summary.mjs';

const recordedMutmutRun = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, '../../../../languages/python/ingest/fixtures/mutmut-run.json'),
    'utf8',
  ),
);

const WAY_OUT =
  'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.';
const PIT_WAY_OUT =
  'Add an assertion that would. If no input can tell the two apart (a compareTo boundary, a discarded lambda return, a field set to the value it already has, a redundant trim() or sorted()), simplify the code so this mutant disappears.';

function enforceable(findings) {
  return findings.filter(({ classification }) => classification === 'enforceable');
}

function summaryOf(findings) {
  return renderConsoleSummary({ newFindings: findings, toolErrors: [] }, { color: false });
}

function entriesOf(findings) {
  return summaryOf(findings)
    .split('\n')
    .filter((line) => line.startsWith('  '));
}

function topLevelMutant(status, line) {
  return {
    status,
    mutatorName: 'ArithmeticOperator',
    replacement: `value - ${String(line)}`,
    original: `value + ${String(line)}`,
    location: { start: { line, column: 3 } },
  };
}

function strykerMutant(status, line, functionName = 'price') {
  return { ...topLevelMutant(status, line), functionName };
}

function strykerFindings(mutants) {
  return normalizeMutation({ files: { 'src/pricing.ts': { mutants } } }, 'mutation');
}

function strykerSurvivor(line) {
  return [
    `  mutation/mutant-survived src/pricing.ts:${String(line)}`,
    `    Survived ArithmeticOperator at column 3: replacing \`value + ${String(line)}\` with \`value - ${String(line)}\` fails no test. ${WAY_OUT}`,
  ];
}

function unreached(header, text) {
  return [header, `    ${text} that no test runs. Add a test that reaches this code.`];
}

function pitMutation(status, line, { method = 'total', descriptor = '(Ljava/util/List;)I' } = {}) {
  return `<mutation detected='false' status='${status}'><sourceFile>Cart.java</sourceFile><mutatedClass>shop.Cart</mutatedClass><mutatedMethod>${method}</mutatedMethod><methodDescription>${descriptor}</methodDescription><lineNumber>${String(line)}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator><description>Replaced integer addition with subtraction ${String(line)}</description></mutation>`;
}

function pitFindings(mutations) {
  return enforceable(
    ingestPit(`<mutations>${mutations.join('')}</mutations>`, {
      resolvePath: () => 'src/main/java/shop/Cart.java',
    }).findings,
  );
}

function pitSurvivor(line) {
  return [
    `  pit/mutant-survived src/main/java/shop/Cart.java:${String(line)}`,
    `    Survived MathMutator: Replaced integer addition with subtraction ${String(line)}: no test fails when this code changes. ${PIT_WAY_OUT}`,
  ];
}

function survivorTail(header, text) {
  return [header, `    and ${text} (listed in the diagnostics file)`];
}

describe('mutation entries in the console summary', () => {
  it('prints one entry per function for Stryker mutants no test runs', () => {
    const findings = strykerFindings([4, 5, 7, 9].map((line) => strykerMutant('NoCoverage', line)));

    expect(entriesOf(findings)).toEqual(
      unreached(
        '  mutation/mutant-nocoverage src/pricing.ts:4',
        'price: 4 mutants on lines 4 to 9',
      ),
    );
  });

  it('prints three survivors of a Stryker function and counts the rest', () => {
    const findings = strykerFindings(
      [2, 3, 4, 5, 6].map((line) => strykerMutant('Survived', line)),
    );

    expect(entriesOf(findings)).toEqual([
      ...strykerSurvivor(2),
      ...strykerSurvivor(3),
      ...strykerSurvivor(4),
      ...survivorTail(
        '  mutation/mutant-survived src/pricing.ts',
        '2 more surviving mutants in price from line 5',
      ),
    ]);
  });

  it('folds PIT mutants per method and drops the descriptor from the name', () => {
    const findings = pitFindings([
      pitMutation('NO_COVERAGE', 11, { method: 'discount' }),
      pitMutation('NO_COVERAGE', 12, { method: 'discount' }),
      pitMutation('NO_COVERAGE', 14, { method: 'discount' }),
      ...[3, 4, 5, 6, 7].map((line) => pitMutation('SURVIVED', line)),
    ]);

    expect(entriesOf(findings)).toEqual([
      ...unreached(
        '  pit/mutant-nocoverage src/main/java/shop/Cart.java:11',
        'Cart#discount: 3 mutants on lines 11 to 14',
      ),
      ...pitSurvivor(3),
      ...pitSurvivor(4),
      ...pitSurvivor(5),
      ...survivorTail(
        '  pit/mutant-survived src/main/java/shop/Cart.java',
        '2 more surviving mutants in Cart#total from line 6',
      ),
    ]);
  });

  it('keeps the survivors of two PIT overloads apart', () => {
    const findings = pitFindings(
      ['(I)I', '(J)I'].flatMap((descriptor, overload) =>
        [1, 2, 3, 4].map((line) => pitMutation('SURVIVED', overload * 10 + line, { descriptor })),
      ),
    );

    expect(entriesOf(findings)).toEqual([
      ...pitSurvivor(1),
      ...pitSurvivor(2),
      ...pitSurvivor(3),
      ...survivorTail(
        '  pit/mutant-survived src/main/java/shop/Cart.java',
        '1 more surviving mutant in Cart#total from line 4',
      ),
      ...pitSurvivor(11),
      ...pitSurvivor(12),
      ...pitSurvivor(13),
      ...survivorTail(
        '  pit/mutant-survived src/main/java/shop/Cart.java',
        '1 more surviving mutant in Cart#total from line 14',
      ),
    ]);
  });

  it('folds the mutmut mutants of a recorded run per function', () => {
    const findings = enforceable(ingestMutmut(recordedMutmutRun).findings);

    expect(entriesOf(findings)).toEqual([
      '  mutmut/mutant-survived src/shop/pricing.py:6',
      `    Survived number: replacing \`0\` with \`1\` fails no test. ${WAY_OUT}`,
      '  mutmut/mutant-survived src/shop/pricing.py:10',
      `    Survived operator: replacing \`>\` with \`>=\` fails no test. ${WAY_OUT}`,
      '  mutmut/mutant-survived src/shop/pricing.py:10',
      `    Survived number: replacing \`100\` with \`101\` fails no test. ${WAY_OUT}`,
      ...survivorTail(
        '  mutmut/mutant-survived src/shop/pricing.py',
        '2 more surviving mutants in total from line 11',
      ),
      ...unreached(
        '  mutmut/mutant-nocoverage src/shop/pricing.py:28',
        'Cart.label: 7 mutants on line 28',
      ),
      ...unreached(
        '  mutmut/mutant-nocoverage src/shop/pricing.py:39',
        'fetch: 2 mutants on line 39',
      ),
      ...unreached(
        '  mutmut/mutant-nocoverage src/shop/pricing.py:43',
        'never_called: 8 mutants on line 43',
      ),
    ]);
  });

  it('keeps covered survivors and folds the unreached mutants of the same function', () => {
    const findings = strykerFindings([
      strykerMutant('Survived', 2),
      strykerMutant('NoCoverage', 6),
      strykerMutant('Survived', 3),
      strykerMutant('NoCoverage', 8),
    ]);

    expect(entriesOf(findings)).toEqual([
      ...unreached(
        '  mutation/mutant-nocoverage src/pricing.ts:6',
        'price: 2 mutants on lines 6 to 8',
      ),
      ...strykerSurvivor(2),
      ...strykerSurvivor(3),
    ]);
  });

  it('keeps a single unreached mutant as it is and folds per function, not per file', () => {
    const findings = strykerFindings([
      strykerMutant('NoCoverage', 2),
      strykerMutant('NoCoverage', 6, 'total'),
      strykerMutant('NoCoverage', 7, 'total'),
      topLevelMutant('NoCoverage', 1),
      topLevelMutant('NoCoverage', 9),
    ]);

    expect(entriesOf(findings)).toEqual([
      '  mutation/mutant-nocoverage src/pricing.ts:2',
      '    NoCoverage ArithmeticOperator at column 3: no test runs this code. Add a test that reaches it.',
      ...unreached(
        '  mutation/mutant-nocoverage src/pricing.ts:6',
        'total: 2 mutants on lines 6 to 7',
      ),
      ...unreached(
        '  mutation/mutant-nocoverage src/pricing.ts:1',
        'top-level code: 2 mutants on lines 1 to 9',
      ),
    ]);
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
    const findings = [
      lint,
      ...enforceable(
        strykerFindings([2, 3, 4, 5, 6, 7].map((line) => strykerMutant('NoCoverage', line))),
      ),
    ];
    const written = json(findings);

    const summary = summaryOf(findings);

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✖ 7 new enforceable violations',
        '  eslint/no-console src/pricing.ts:1',
        '    Unexpected console statement.',
        ...unreached(
          '  mutation/mutant-nocoverage src/pricing.ts:2',
          'price: 6 mutants on lines 2 to 7',
        ),
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
    expect(json(findings)).toBe(written);
  });
});
