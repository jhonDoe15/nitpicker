import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestPit } from '../pit.mjs';
import { createGeneratedFilter } from './generated-filter.mjs';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');
const report = readFileSync(path.join(fixtures, 'kotlin-measurement-pit.xml'), 'utf8');
const facts = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, 'test-support/kotlin-measurement-facts.json'),
    'utf8',
  ),
);

const resolvePath = (className, sourceFile) =>
  className.includes('$inlined$') ? undefined : `src/main/kotlin/demo/${sourceFile}`;

const leftovers = (options) =>
  ingestPit(report, { resolvePath, ...options })
    .findings.filter((finding) => finding.classification === 'enforceable')
    .map(({ rule, path: file, location, identity }) => [
      `${path.basename(file)}:${String(location.line)}`,
      rule,
      identity,
    ]);
const counts = (options) =>
  Object.fromEntries(
    ingestPit(report, { resolvePath, ...options })
      .findings.filter((finding) => finding.rule === 'mutation-summary')
      .map(({ metric }) => [metric.name, metric.value]),
  );

const droppedByRule = () => {
  const rules = {};
  const generated = (mutants) => {
    const judge = createGeneratedFilter(facts)(mutants);
    return (mutant, filePath) => {
      const rule = judge(mutant, filePath);
      if (rule !== undefined && ['SURVIVED', 'NO_COVERAGE'].includes(mutant.status)) {
        rules[rule] = (rules[rule] ?? 0) + 1;
      }
      return rule;
    };
  };
  ingestPit(report, { resolvePath, generated });
  return rules;
};

describe('the Kotlin mutation filter on the measurement fixture', () => {
  it('counts what the unfiltered report would fail the gate with', () => {
    expect(counts()).toEqual({ Survived: 84, Killed: 362, NoCoverage: 18, Timeout: 26 });
  });

  it('leaves out 83 survivors and uncovered mutants, by rule', () => {
    expect(droppedByRule()).toEqual({
      'coroutine-throw-on-failure': 25,
      'state-machine-branch': 20,
      'coroutine-state-field': 17,
      'generated-accessor': 8,
      'suspend-lambda-result': 6,
      'null-check-intrinsic': 2,
      'inline-function-body': 2,
      'exhaustive-when-last-branch': 1,
      'generated-member': 1,
      'default-impls-twin': 1,
    });
  });

  it('leaves out the 83 mutants of compiler-generated code that would fail the gate and keeps 19', () => {
    const options = { generated: createGeneratedFilter(facts) };

    expect(counts(options)).toEqual({ Survived: 19, Killed: 268, Timeout: 11, GeneratedCode: 192 });
    expect(leftovers(options)).toEqual([
      [
        'More.kt:112',
        'mutant-survived',
        'MoreKt|failing(I)I|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'More.kt:112',
        'mutant-survived',
        'MoreKt|failing(I)I|RemoveConditionalMutator_ORDER_ELSE|removed conditional - replaced comparison check with false#1',
      ],
      [
        'More.kt:73',
        'mutant-survived',
        'MoreKt|finals(LStringReader;)I|VoidMethodCallMutator|removed call to StringReader::close#1',
      ],
      [
        'More.kt:30',
        'mutant-survived',
        'MoreKt|inRange(I)Z|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'More.kt:10',
        'mutant-survived',
        'MoreKt|rangeSum(I)I|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'More.kt:13',
        'mutant-survived',
        'MoreKt|rangeSum(I)I|ConditionalsBoundaryMutator|changed conditional boundary#2',
      ],
      [
        'More.kt:10',
        'mutant-survived',
        'MoreKt|rangeSum(I)I|RemoveConditionalMutator_ORDER_IF|removed conditional - replaced comparison check with true#1',
      ],
      [
        'More.kt:120',
        'mutant-survived',
        'MoreKt|unreachable(LColor;)I|RemoveConditionalMutator_EQUAL_IF|removed conditional - replaced equality check with true#1',
      ],
      [
        'More.kt:77',
        'mutant-survived',
        'MoreKt|uses(LStringReader;)I|VoidMethodCallMutator|removed call to CloseableKt::closeFinally#1',
      ],
      [
        'Flow.kt:22',
        'mutant-survived',
        'FlowKt|maybe(LList;)LInteger;|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'Coro.kt:44',
        'mutant-survived',
        'CoroKt|grade(I)LString;|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'Coro.kt:44',
        'mutant-survived',
        'CoroKt|grade(I)LString;|ConditionalsBoundaryMutator|changed conditional boundary#2',
      ],
      [
        'Coro.kt:45',
        'mutant-survived',
        'CoroKt|grade(I)LString;|ConditionalsBoundaryMutator|changed conditional boundary#3',
      ],
      [
        'Coro.kt:45',
        'mutant-survived',
        'CoroKt|grade(I)LString;|ConditionalsBoundaryMutator|changed conditional boundary#4',
      ],
      [
        'Coro.kt:44',
        'mutant-survived',
        'CoroKt|grade(I)LString;|RemoveConditionalMutator_ORDER_IF|removed conditional - replaced comparison check with true#1',
      ],
      [
        'Coro.kt:45',
        'mutant-survived',
        'CoroKt|grade(I)LString;|RemoveConditionalMutator_ORDER_IF|removed conditional - replaced comparison check with true#2',
      ],
      [
        'Coro.kt:26',
        'mutant-survived',
        'CoroKt|safeFetch(ILContinuation;)LObject;|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'Nulls.kt:29',
        'mutant-survived',
        'NullsKt|useInline(I)I|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'Nulls.kt:29',
        'mutant-survived',
        'NullsKt|useInline(I)I|ConditionalsBoundaryMutator|changed conditional boundary#2',
      ],
    ]);
  });
});
