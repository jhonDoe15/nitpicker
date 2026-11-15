import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { buildFixPlans } from './build-fix-plans.mjs';
import { defineBuilders } from './registry.mjs';
import { stepsOf } from './plan-parts/steps.mjs';
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
const OVERLOADS = [
  'class A {',
  '  get(a: string) {',
  '    return a > 1;',
  '  }',
  '  get(a: number) {',
  '    return a < 1;',
  '  }',
  '}',
  '',
].join('\n');

function mutant(line, fields = {}) {
  return enforceable({
    tool: 'stryker',
    rule: 'mutant-survived',
    path: 'src/a.ts',
    symbol: 'get',
    location: { line, column: 5 },
    message:
      'Survived EqualityOperator at column 5: replacing `a > 1` with `a >= 1` fails no test.',
    ...fields,
  });
}

function plans(findings, files = { 'src/a.ts': OVERLOADS }, builders) {
  return buildFixPlans(findings, { index: INDEX, env: filesEnvironment(files), builders });
}

describe('group keys', () => {
  it('keep overloads and same-named methods in separate plans', () => {
    const found = plans([mutant(3), mutant(6)]);

    expect(found).toHaveLength(2);
    expect(found.map((plan) => [plan.target.startLine, plan.target.endLine])).toEqual([
      [3, 3],
      [6, 6],
    ]);
  });

  it('keep different unstripped symbols apart', () => {
    const found = plans([
      mutant(3, { symbol: 'A#get(String)' }),
      mutant(3, { symbol: 'B#get(int)' }),
    ]);

    expect(found).toHaveLength(2);
  });

  it('span the function and widen to the last finding', () => {
    const [plan] = plans([mutant(3), mutant(4)]);

    expect(plan.target).toEqual({ path: 'src/a.ts', symbol: 'get', startLine: 2, endLine: 4 });
    expect(plan.context.source).toBe('return a > 1;');
  });
});

describe('findings without a line and failing groups', () => {
  it('keep findings without a line as single plans that fit the schema', () => {
    const noLine = (fields) => mutant(3, { location: undefined, ...fields });
    const found = plans([noLine(), noLine(), mutant(3)]);
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(SCHEMA);

    expect(found).toHaveLength(3);
    expect(validate(found), JSON.stringify(validate.errors)).toBe(true);
  });

  it('fall back to single plans when building a group throws', () => {
    const builders = defineBuilders([
      {
        id: 'x',
        rules: [{ tool: 'mutation', rule: 'mutant-survived' }],
        presets: ['typescript'],
        build: (finding) => ({
          kind: 'kill-mutant',
          target: { path: finding.path, startLine: 1, endLine: 1 },
          steps: ['s'],
        }),
        buildGroup: () => {
          throw new Error('boom');
        },
      },
    ]);

    expect(plans([mutant(3), mutant(4)], {}, builders)).toHaveLength(2);
  });

  it('keep each finding allowed form and way-out once in a group', () => {
    const withForm = (line, form) =>
      mutant(line, { allowedForm: `Add an assertion that would. ${form}` });
    const [plan] = plans([withForm(3, 'Way A.'), withForm(4, 'Way A.'), withForm(3, 'Way B.')]);

    expect(plan.steps.slice(-2)).toEqual(['Way A.', 'Way B.']);
  });
});

describe('stepsOf', () => {
  it('drops repeated sentences and steps contained in another step', () => {
    expect(
      stepsOf('Read it. Test it.', 'Test it. Run it.', 'Run it.', [
        'Keep this one.',
        'Keep this one.',
      ]),
    ).toEqual(['Read it. Test it.', 'Run it.', 'Keep this one.']);
  });

  it('removes the repeated form from an unreached or branch plan', () => {
    const form = 'Add a test that reaches it.';
    const unreached = (line) =>
      mutant(line, {
        rule: 'mutant-nocoverage',
        allowedForm: form,
        message: 'NoCoverage MathMutator at column 5: no test runs this code.',
      });
    const [plan] = plans([unreached(3), unreached(4)]);

    expect(plan.steps).toEqual([
      'Read get (src/a.ts:2-4): no test runs 2 mutated places, listed in context.mutants.',
      'Create src/a.test.ts for the test, following the other test files of the project.',
      form,
      'Assert the result, so that the mutants in this code fail the test.',
    ]);
  });
});
