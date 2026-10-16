import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestPit } from '../pit.mjs';
import { createGeneratedFilter } from './generated-filter.mjs';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');
const report = readFileSync(path.join(fixtures, 'kotlin-measurement-pit.xml'), 'utf8');
const facts = JSON.parse(
  readFileSync(path.join(fixtures, 'kotlin-measurement-facts.json'), 'utf8'),
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

describe('the Kotlin mutation filter on the measurement fixture', () => {
  it('reports 60 mutants that would fail the gate when nothing is filtered', () => {
    expect(leftovers()).toHaveLength(60);
    expect(counts()).toEqual({ Survived: 43, Killed: 177, NoCoverage: 17, Timeout: 3 });
  });

  it('leaves out the 44 mutants of compiler-generated code and keeps the 16 a test could kill', () => {
    const options = { generated: createGeneratedFilter(facts) };

    expect(counts(options)).toEqual({
      Survived: 15,
      Killed: 145,
      NoCoverage: 1,
      GeneratedCode: 79,
    });
    expect(leftovers(options)).toEqual([
      [
        'More.kt:112',
        'mutant-survived',
        'demo.MoreKt|failing(I)I|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'More.kt:73',
        'mutant-survived',
        'demo.MoreKt|finals(Ljava/io/StringReader;)I|VoidMethodCallMutator|removed call to java/io/StringReader::close#1',
      ],
      [
        'More.kt:30',
        'mutant-survived',
        'demo.MoreKt|inRange(I)Z|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'More.kt:10',
        'mutant-survived',
        'demo.MoreKt|rangeSum(I)I|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'More.kt:13',
        'mutant-survived',
        'demo.MoreKt|rangeSum(I)I|ConditionalsBoundaryMutator|changed conditional boundary#2',
      ],
      [
        'More.kt:77',
        'mutant-survived',
        'demo.MoreKt|uses(Ljava/io/StringReader;)I|VoidMethodCallMutator|removed call to kotlin/io/CloseableKt::closeFinally#1',
      ],
      [
        'Coro.kt:44',
        'mutant-survived',
        'demo.CoroKt|grade(I)Ljava/lang/String;|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'Coro.kt:44',
        'mutant-survived',
        'demo.CoroKt|grade(I)Ljava/lang/String;|ConditionalsBoundaryMutator|changed conditional boundary#2',
      ],
      [
        'Coro.kt:45',
        'mutant-survived',
        'demo.CoroKt|grade(I)Ljava/lang/String;|ConditionalsBoundaryMutator|changed conditional boundary#3',
      ],
      [
        'Coro.kt:45',
        'mutant-survived',
        'demo.CoroKt|grade(I)Ljava/lang/String;|ConditionalsBoundaryMutator|changed conditional boundary#4',
      ],
      [
        'Coro.kt:26',
        'mutant-survived',
        'demo.CoroKt|safeFetch(ILkotlin/coroutines/Continuation;)Ljava/lang/Object;|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'Flow.kt:22',
        'mutant-survived',
        'demo.FlowKt|maybe(Ljava/util/List;)Ljava/lang/Integer;|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'Nulls.kt:27',
        'mutant-survived',
        'demo.NullsKt|useInline(I)I|ConditionalsBoundaryMutator|changed conditional boundary#1',
      ],
      [
        'Nulls.kt:27',
        'mutant-survived',
        'demo.NullsKt|useInline(I)I|ConditionalsBoundaryMutator|changed conditional boundary#2',
      ],
      [
        'Nulls.kt:10',
        'mutant-survived',
        'demo.Person|forced()I|VoidMethodCallMutator|removed call to kotlin/jvm/internal/Intrinsics::checkNotNull#1',
      ],
      [
        'More.kt:97',
        'mutant-nocoverage',
        'demo.Animal$DefaultImpls|sound(Ldemo/Animal;)Ljava/lang/String;|EmptyObjectReturnValsMutator|replaced return value with "" for demo/Animal$DefaultImpls::sound#1',
      ],
    ]);
  });
});
