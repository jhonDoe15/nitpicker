import { describe, expect, it } from 'vitest';
import { createGeneratedFilter } from './generated-filter.mjs';
import {
  FILE,
  filterFor,
  fn,
  lambda,
  mutant,
  removed,
  returns,
} from './test-support/filter-helpers.mjs';

const suspendDescription = '(ILkotlin/coroutines/Continuation;)Ljava/lang/Object;';

describe('the removed call of throwOnFailure', () => {
  const filter = filterFor();
  const call = removed('kotlin/ResultKt::throwOnFailure');

  it('is dropped in the state machine of a suspend function and kept where Result.getOrThrow was inlined', () => {
    expect([
      filter(mutant({ ...call, method: 'fetch', methodDescription: suspendDescription }), FILE),
      filter(mutant({ ...call, method: 'risky', methodDescription: '(I)I' }), FILE),
    ]).toEqual(['coroutine-throw-on-failure', undefined]);
  });
});

describe('overloads that share a name', () => {
  const filter = filterFor({
    functions: [
      fn({ name: 'load', start: 10, end: 12, suspend: true, returnsUnit: true }),
      fn({ name: 'load', start: 14, end: 16, suspend: true, returnsUnit: false }),
      fn({ name: 'make', start: 20, end: 20, staticIn: 'demo.DemoKt' }),
      fn({ name: 'make', start: 30, end: 30 }),
    ],
  });

  it('drops the Unit result of the Unit overload and keeps that of the other one', () => {
    expect(
      [11, 15].map((line) => filter(mutant({ method: 'load', ...returns, line }), FILE)),
    ).toEqual(['suspend-unit-result', undefined]);
  });

  it('drops the bridge of the static overload and keeps the instance overload', () => {
    expect(
      [20, 30].map((line) => filter(mutant({ method: 'make', ...returns, line }), FILE)),
    ).toEqual(['jvm-static-bridge', undefined]);
  });
});

describe('mangled and renamed names', () => {
  const filter = filterFor({
    functions: [
      fn({ name: 'put', start: 10, end: 12, suspend: true, returnsUnit: true }),
      fn({ name: 'internalPut', start: 14, end: 16, suspend: true, returnsUnit: true }),
      fn({
        name: 'written',
        jvmName: 'renamed',
        start: 18,
        end: 20,
        suspend: true,
        returnsUnit: true,
      }),
    ],
  });

  it.each([
    ['a hash that holds a dash', 'put--0iqXNs', 11],
    ['a hash of letters and digits', 'put-Rw7lfUa', 11],
    ['the module suffix of an internal function', 'internalPut$demo', 15],
    ['the name of @JvmName', 'renamed', 19],
  ])('drops the Unit result under %s', (name, method, line) => {
    expect(filter(mutant({ method, ...returns, line }), FILE)).toBe('suspend-unit-result');
  });
});

describe('builders that return Unit', () => {
  const filter = filterFor({
    lambdas: [
      lambda({ start: 10, end: 10, valueLines: [10, 10], callee: 'launch' }),
      lambda({ start: 12, end: 12, valueLines: [12, 12], callee: 'launch', projectCallee: true }),
    ],
  });

  it('keeps the value of a lambda that goes to a project function of the same name', () => {
    expect(
      [10, 12].map((line) => filter(mutant({ method: 'invokeSuspend', ...returns, line }), FILE)),
    ).toEqual(['suspend-lambda-result', undefined]);
  });
});

describe('a mixed module', () => {
  const filter = filterFor();
  const accessor = { method: 'access$000', ...returns };

  it('applies the source-free rules to Kotlin files and to unresolved paths, not to Java files', () => {
    expect([
      filter(mutant(accessor), FILE),
      filter(mutant(accessor), undefined),
      filter(mutant(accessor), 'src/main/java/demo/Account.java'),
    ]).toEqual(['synthetic-accessor', 'synthetic-accessor', undefined]);
  });
});

describe('the filter of one report', () => {
  const facts = { files: [] };
  const twin = { className: 'demo.Animal$DefaultImpls', method: 'sound', ...returns };

  it('takes its siblings from the mutants it is made for and keeps no state between reports', () => {
    const create = createGeneratedFilter(facts);
    const withSibling = create([{ className: 'demo.Animal', method: 'sound' }]);
    const alone = create([]);

    expect([withSibling(mutant(twin), FILE), alone(mutant(twin), FILE)]).toEqual([
      'default-impls-twin',
      undefined,
    ]);
  });

  it.each([
    [{}, 'the report has no "files" list'],
    [
      { files: [{ file: 'A.kt' }] },
      'the entry of A.kt lacks lines, classes, functions, lambdas, branching, casts',
    ],
  ])('refuses facts of another shape: %j', (broken, message) => {
    expect(() => createGeneratedFilter(broken)).toThrow(message);
  });
});
