import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { buildFixPlans } from './build-fix-plans.mjs';
import { NO_FILES } from './environment.mjs';
import { PLAN_KINDS, builderForEntry, defineBuilders, fixPlanRules } from './registry.mjs';
import { indexEntries, readReferenceEntries } from '../reference/store.mjs';

const FIX_PLAN_RULES = fixPlanRules();
function byName(left, right) {
  return left.localeCompare(right);
}

const SCHEMA = JSON.parse(
  readFileSync(new URL('../../spec/fix-plans.schema.json', import.meta.url), 'utf8'),
);

function builder(fields) {
  return {
    id: 'demo',
    rules: [{ tool: 'structure', rule: 'demo' }],
    presets: ['java'],
    build: () => ({ kind: 'follow-allowed-form', steps: ['x'] }),
    ...fields,
  };
}

describe('defineBuilders', () => {
  it('accepts well formed builders', () => {
    expect(defineBuilders([builder({})])).toHaveLength(1);
  });

  it.each([
    ['has no id', { id: undefined }],
    ['lists no rules', { rules: [] }],
    ['lists a rule without a tool', { rules: [{ rule: 'x' }] }],
    ['lists no presets', { presets: [] }],
    ['has no build function', { build: undefined }],
  ])('refuses a builder that %s', (problem, fields) => {
    expect(() => defineBuilders([builder(fields)])).toThrow(problem);
  });

  it('refuses a repeated id and a rule that two builders list', () => {
    expect(() =>
      defineBuilders([builder({}), builder({ rules: [{ tool: 'a', rule: 'b' }] })]),
    ).toThrow('repeats an id');
    expect(() => defineBuilders([builder({}), builder({ id: 'other' })])).toThrow(
      'repeats the rule structure/demo',
    );
  });
});

describe('the registered builders', () => {
  it('list only rules the rule reference has', () => {
    const entries = readReferenceEntries();
    const missing = FIX_PLAN_RULES.filter(
      ({ tool, rule }) => !entries.some((entry) => entry.tool === tool && entry.rule === rule),
    );

    expect(missing).toEqual([]);
    expect(FIX_PLAN_RULES.length).toBeGreaterThan(150);
  });

  it('cover every nitpicker check that needs judgment', () => {
    const covered = (tool, rule) =>
      FIX_PLAN_RULES.some((own) => own.tool === tool && own.rule === rule);

    expect(
      [
        ['structure', 'function-lines-limit'],
        ['structure', 'file-lines-limit'],
        ['crap', 'crap-score-limit'],
        ['coverage', 'changed-branch-coverage'],
        ['mutation', 'mutant-survived'],
        ['mutation', 'mutant-nocoverage'],
        ['duplicates', 'duplicate-clone'],
        ['coupling', 'stability-direction'],
        ['coding-standards', 'runtime-boundary/<rule>'],
        ['archunit', 'spring-layout'],
        ['python-rules', 'tautological-assert'],
        ['kotlin-source', 'WeakHash'],
        ['eslint', 'nitpicker/no-null'],
      ].filter(([tool, rule]) => !covered(tool, rule)),
    ).toEqual([]);
  });

  it('give no plan to third-party lint rules', () => {
    const entries = readReferenceEntries();
    const lint = entries.filter(({ tool }) =>
      ['pmd', 'spotbugs', 'ruff', 'checkstyle'].includes(tool),
    );
    const planned = lint.filter((entry) => builderForEntry(entry) !== undefined);

    expect(planned.map(({ id }) => id).toSorted(byName)).toEqual([
      'pmd/AssertionInControlFlow',
      'pmd/CoroutineEscapesTest',
      'pmd/DisabledTest',
    ]);
  });

  it('build a plan of a known kind that fits the schema for each of their rules', () => {
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(SCHEMA);
    const entries = indexEntries(readReferenceEntries());
    const findings = FIX_PLAN_RULES.map(({ tool, rule }, position) => ({
      tool,
      rule,
      path: 'src/a.ts',
      identity: String(position),
      message: 'A message.',
      classification: 'enforceable',
      location: { line: 1 },
    }));
    const plans = buildFixPlans(findings, { index: entries, env: NO_FILES });

    expect(plans).toHaveLength(findings.length);
    expect(plans.map(({ kind }) => kind).filter((kind) => !PLAN_KINDS.includes(kind))).toEqual([]);
    expect(validate(plans), JSON.stringify(validate.errors)).toBe(true);
  });

  it('use every kind the schema lists, and no other', () => {
    expect(SCHEMA.$defs.plan.properties.kind.enum).toEqual([...PLAN_KINDS]);
    const used = new Set(
      buildFixPlans(
        FIX_PLAN_RULES.map(({ tool, rule }) => ({
          tool,
          rule,
          path: 'a.ts',
          identity: 'x',
          message: 'm',
          classification: 'enforceable',
        })),
        { index: indexEntries(readReferenceEntries()), env: NO_FILES },
      ).map(({ kind }) => kind),
    );

    expect([...used].toSorted(byName)).toEqual([...PLAN_KINDS].toSorted(byName));
  });
});
