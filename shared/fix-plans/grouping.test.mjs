import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { buildFixPlans } from './build-fix-plans.mjs';
import { planSection } from './render.mjs';
import { enforceable, filesEnvironment } from './test-support/env.mjs';
import { indexEntries } from '../reference/store.mjs';
import { ruleEntry } from '../reference/entry.mjs';

const SCHEMA = JSON.parse(
  readFileSync(new URL('../../spec/fix-plans.schema.json', import.meta.url), 'utf8'),
);
const INDEX = indexEntries(
  [
    ['mutation', 'mutant-survived', ['stryker']],
    ['mutation', 'mutant-nocoverage', ['stryker']],
    ['coverage', 'changed-branch-coverage', ['istanbul']],
  ].map(([tool, rule, findingTools]) =>
    ruleEntry({
      tool,
      rule,
      page: 'p',
      analyzers: { typescript: ['x'] },
      summary: 's',
      findingTools,
    }),
  ),
);
const FORM = 'Add an assertion that would. If no input can tell the two apart, simplify the code.';
const FILES = {
  'src/a.ts': `export function f(a) {\n${'  const x = a;\n'.repeat(12)}}\n`,
  'src/b.ts': 'export function g() {}\n',
  'test/a.test.ts': "import { f } from '../src/a';\n",
};

function survived(line, column, replacement, fields = {}) {
  return enforceable({
    tool: 'stryker',
    rule: 'mutant-survived',
    path: 'src/a.ts',
    symbol: 'f',
    location: { line, column },
    allowedForm: FORM,
    message: `Survived EqualityOperator at column ${String(column)}: replacing \`a > 1\` with \`${replacement}\` fails no test. ${FORM}`,
    ...fields,
  });
}

function branch(line, arm, fields = {}) {
  return enforceable({
    tool: 'istanbul',
    rule: 'changed-branch-coverage',
    path: 'src/a.ts',
    symbol: 'f',
    location: { line },
    message: `Branch coverage is 50.00%; minimum is 95%. Not taken: ${arm}. Test it, or remove it if it can't happen.`,
    ...fields,
  });
}

function plans(findings, files = FILES) {
  return buildFixPlans(findings, { index: INDEX, env: filesEnvironment(files) });
}

describe('grouped plans', () => {
  it('write one kill-mutant plan for the surviving mutants of a function', () => {
    const [plan, ...rest] = plans([survived(9, 4, 'a >= 1'), survived(2, 10, 'true')]);

    expect(rest).toEqual([]);
    expect(plan.finding).toEqual({
      tool: 'stryker',
      rule: 'mutant-survived',
      path: 'src/a.ts',
      line: 2,
    });
    expect(plan.findings).toEqual([
      { line: 2, column: 10 },
      { line: 9, column: 4 },
    ]);
    expect(plan.target).toEqual({ path: 'src/a.ts', symbol: 'f', startLine: 1, endLine: 14 });
    expect(plan.context).toEqual({
      source: 'const x = a;',
      mutants: [
        {
          line: 2,
          column: 10,
          mutator: 'EqualityOperator',
          original: 'a > 1',
          replacement: 'true',
        },
        {
          line: 9,
          column: 4,
          mutator: 'EqualityOperator',
          original: 'a > 1',
          replacement: 'a >= 1',
        },
      ],
      testFile: { path: 'test/a.test.ts', exists: true },
    });
    expect(plan.steps).toHaveLength(5);
    expect(plan.steps[1]).toBe('Add the test to test/a.test.ts.');
  });

  it('show an empty replacement string as the string', () => {
    const empty = survived(2, 4, 'x', {
      message:
        "Survived StringLiteral at column 4: replacing `'a'` with `''` (an empty string) fails no test.",
    });
    const [plan] = plans([empty]);

    expect(plan.context.replacement).toBe("''");
  });

  it('write each step once and no fragment of the finding message', () => {
    const [plan] = plans([survived(2, 4, 'a >= 1')]);

    expect(new Set(plan.steps).size).toBe(plan.steps.length);
    expect(plan.steps.join(' ')).not.toContain('Add an assertion that would');
    expect(plan.steps.at(-1)).toBe('If no input can tell the two apart, simplify the code.');
  });

  it('keep separate plans for another function, another file, another rule and no symbol', () => {
    const found = plans([
      survived(2, 4, 'a >= 1'),
      survived(3, 4, 'true'),
      survived(2, 4, 'true', { symbol: 'g' }),
      survived(2, 4, 'true', { path: 'src/b.ts' }),
      survived(2, 4, 'true', { symbol: undefined }),
      survived(3, 4, 'true', { symbol: undefined }),
      survived(2, 4, 'true', {
        rule: 'mutant-nocoverage',
        message: 'NoCoverage Math: no test runs this code.',
      }),
    ]);

    expect(found.map((plan) => plan.findings?.length)).toEqual([
      2,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('group unreached mutants into one test for the code', () => {
    const unreached = (line) =>
      survived(line, 3, 'x', {
        rule: 'mutant-nocoverage',
        message:
          'NoCoverage MathMutator at column 3: no test runs this code. Add a test that reaches it.',
        allowedForm: 'Add a test that reaches it.',
      });
    const [plan] = plans([unreached(5), unreached(2)]);

    expect(plan.kind).toBe('add-test-for-branch');
    expect(plan.findings.map(({ line }) => line)).toEqual([2, 5]);
    expect(plan.context.unreached).toBe(true);
    expect(plan.context.mutants).toHaveLength(2);
  });

  it('group the uncovered branches of a function', () => {
    const [plan] = plans([branch(8, 'else arm'), branch(2, 'the true arm of the ?: at 2:10')]);

    expect(plan.kind).toBe('add-test-for-branch');
    expect(plan.finding.line).toBe(2);
    expect(plan.target).toEqual({ path: 'src/a.ts', symbol: 'f', startLine: 1, endLine: 14 });
    expect(plan.context.branches).toEqual([
      { line: 2, percent: 50, notTaken: ['the true arm of the ?: at 2:10'] },
      { line: 8, percent: 50, notTaken: ['else arm'] },
    ]);
    expect(plan.doneWhen).toBe(
      'nitpicker reports no istanbul/changed-branch-coverage finding for f (src/a.ts:1-14).',
    );
  });

  it('keep the plan of a single mutant as it was, without a findings list', () => {
    const [plan] = plans([survived(2, 4, 'a >= 1')]);

    expect(plan.findings).toBeUndefined();
    expect(plan.context.mutator).toBe('EqualityOperator');
  });

  it('fit the schema and print a count in the report line', () => {
    const found = plans([
      survived(2, 4, 'a >= 1'),
      survived(3, 4, 'true'),
      branch(2, 'x'),
      branch(3, 'y'),
    ]);
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(SCHEMA);

    expect(validate(found), JSON.stringify(validate.errors)).toBe(true);
    expect(planSection(found).slice(2)).toEqual([
      '  stryker/mutant-survived src/a.ts:1 kill-mutant (2 findings)',
      '  istanbul/changed-branch-coverage src/a.ts:1 add-test-for-branch (2 findings)',
    ]);
  });
});
