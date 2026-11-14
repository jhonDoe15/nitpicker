import { fieldOf, numberOr } from '../../../../../../shared/values/readers.mts';
import { kotlinSources, onlyTools, rulesOf } from '../../__tests__/kotlin-e2e-project.mts';
import type { DiffResult } from '../../__tests__/kotlin-e2e-project.mts';
import { assigned } from '../../test-support/views/assigned.mts';
import { exceptionRoute } from '../../test-support/views/kotlin-e2e-views.mts';
import type { Finding } from '../../../../../../shared/values/findings.mts';

export function generatedBranchLines(report: string): { covered: number[]; missed: number[] } {
  const generatedFile = report.slice(report.indexOf('<sourcefile name="Generated.kt">'));
  const linesWith = (counter: string) =>
    [
      ...generatedFile.matchAll(new RegExp(`<line nr="(\\d+)"[^>]* ${counter}="[1-9]\\d*"`, 'gu')),
    ].map(([, line]) => Number(line));

  return { covered: linesWith('cb'), missed: linesWith('mb') };
}

type Check = { readonly actual: unknown; readonly expected: unknown };
type Comparison = { readonly actual: unknown[]; readonly expected: unknown[] };

function compared(checks: readonly Check[]): Comparison {
  return {
    actual: checks.map(({ actual }) => actual),
    expected: checks.map(({ expected }) => expected),
  };
}

const FIRST_GENERATED_LINE = 15;
const SECOND_GENERATED_LINE = 22;
const INSTABILITY = 0.3333;
const INSTABILITY_TOLERANCE = 0.00005;

export function generatedBranchChecks(report: string, findings: readonly Finding[]): Comparison {
  return compared([
    {
      actual: generatedBranchLines(report),
      expected: { covered: [FIRST_GENERATED_LINE, SECOND_GENERATED_LINE], missed: [] },
    },
    { actual: findings.filter(({ rule }) => rule === 'changed-branch-coverage'), expected: [] },
  ]);
}

export function structureChangeChecks(result: DiffResult): Comparison {
  const routeOf = (rule: string, file: string, name: string) =>
    exceptionRoute({ rule, path: `${kotlinSources}/${file}`, function: name });
  const messageOf = (rule: string, symbol: string) =>
    onlyTools(result.newEnforceable, 'structure', 'crap').find(
      (finding) => finding.rule === rule && finding.symbol === symbol,
    )?.message;
  const stable = assigned(
    onlyTools(result.newFindings, 'coupling').find(
      ({ identity }) => identity === 'package:stable2:instability',
    ),
    'stability finding',
  );

  return compared([
    {
      actual: rulesOf(result.newEnforceable, 'structure', 'crap'),
      expected: [
        'crap crap-score-limit Booter.<init>',
        'crap crap-score-limit Booter.label',
        'crap crap-score-limit Left.total',
        'crap crap-score-limit Right.total',
        'crap crap-score-limit classify2',
        'crap crap-score-limit flatten',
        'crap crap-score-limit rank',
        'structure function-control-nesting-limit Booter.<init>',
        'structure function-control-nesting-limit depth',
        'structure function-lines-limit Left.total',
        'structure function-lines-limit Right.total',
        'structure function-parameters-limit combine',
        'structure function-parameters-limit pipeline',
        'structure function-parameters-limit product',
        'structure function-statements-limit Booter.label',
        'structure function-statements-limit Left.total',
        'structure function-statements-limit Right.total',
        'structure function-statements-limit classify2',
        'structure function-statements-limit rank',
        'structure near-duplicate classify(Int)',
        'structure near-duplicate rank(Int)',
        'structure near-duplicate rank(Int)',
      ],
    },
    {
      actual: messageOf('function-control-nesting-limit', 'depth'),
      expected: `depth nests control flow 3 deep (limit 2). Return early instead of nesting. ${routeOf('function-control-nesting-limit', 'change/Deep.kt', 'depth')}`,
    },
    {
      actual: messageOf('function-parameters-limit', 'product'),
      expected: `product grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another. ${routeOf('function-parameters-limit', 'Grown.kt', 'product')}`,
    },
    {
      actual: messageOf('crap-score-limit', 'classify2'),
      expected: `classify2 CRAP rose from 110 to 132 (limit 9). Put new code in a new function and cover it with tests. ${routeOf('crap-score-limit', 'Complex2.kt', 'classify2')}`,
    },
    {
      actual: rulesOf(result.unchangedFindings, 'structure', 'crap'),
      expected: [
        'crap crap-score-limit classify',
        'structure function-parameters-limit sum',
        'structure function-statements-limit classify',
        'structure near-duplicate classify2(Int)',
      ],
    },
    {
      actual: rulesOf(result.newEnforceable, 'duplicates'),
      expected: ['duplicates duplicate-clone Left.kt'],
    },
    {
      actual: onlyTools(result.newEnforceable, 'coupling')
        .filter(({ rule }) => rule === 'stability-direction')
        .map(({ rule, identity, message }) => ({ rule, identity, message })),
      expected: [
        {
          rule: 'stability-direction',
          identity: 'package-edge:stable2->churn2',
          message: `stable2 depends on less stable package churn2. ${exceptionRoute({ rule: 'stability-direction', path: 'stable2' })}`,
        },
      ],
    },
    { actual: fieldOf(stable['metric'], 'name'), expected: 'instability' },
    {
      actual:
        Math.abs(numberOr(fieldOf(stable['metric'], 'value'), 0) - INSTABILITY) <
        INSTABILITY_TOLERANCE,
      expected: true,
    },
    {
      actual: onlyTools(result.unchangedFindings, 'coupling')
        .filter(({ rule }) => rule === 'stability-direction')
        .map(({ identity }) => identity),
      expected: ['package-edge:stable->churn'],
    },
  ]);
}

export function testOnlyFacadeChecks(result: DiffResult): Comparison {
  return compared([
    {
      actual: onlyTools(result.newEnforceable, 'coupling')
        .filter(({ rule }) => rule === 'test-only-export')
        .map(
          ({ path: file, symbol, location }) => `${file}:${String(location?.line)} ${symbol ?? ''}`,
        ),
      expected: ['src/main/kotlin/demo/Shouting.kt:3 demo.ShoutingKt'],
    },
  ]);
}

export function legacyInitChecks(result: DiffResult): Comparison {
  return compared([
    { actual: rulesOf(result.newEnforceable, 'structure', 'crap'), expected: [] },
    {
      actual: rulesOf(result.unchangedFindings, 'structure', 'crap'),
      expected: [
        'crap crap-score-limit Box.<anonymous>.<init>',
        'crap crap-score-limit Box.<init>',
        'crap crap-score-limit Box.Companion.<init>',
        'structure function-control-nesting-limit Box.<anonymous>.<init>',
        'structure function-control-nesting-limit Box.<init>',
        'structure function-control-nesting-limit Box.Companion.<init>',
      ],
    },
  ]);
}
