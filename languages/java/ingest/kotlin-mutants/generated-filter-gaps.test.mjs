import { describe, expect, it } from 'vitest';
import {
  FILE,
  boundary,
  emptyClass,
  filterFor,
  fn,
  lambda,
  mutant,
  negate,
  removed,
  returns,
} from './test-support/filter-helpers.mjs';

const suspendDescription = '(ILkotlin/coroutines/Continuation;)Ljava/lang/Object;';
const unitDescription = '()Lkotlin/Unit;';

describe('operands of a multi-line expression in a suspend function', () => {
  const filter = filterFor({ branching: [5, 6] });
  const inSuspend = { method: 'fetch', methodDescription: suspendDescription };

  it('keeps a conditional on the first and the last line of the expression and drops one between', () => {
    expect([
      filter(mutant({ ...inSuspend, ...negate, line: 5 }), FILE),
      filter(mutant({ ...inSuspend, ...boundary, line: 6 }), FILE),
      filter(mutant({ ...inSuspend, ...negate, line: 7 }), FILE),
    ]).toEqual([undefined, undefined, 'state-machine-branch']);
  });
});

describe('the null check of a multi-line !! expression', () => {
  const filter = filterFor({ bang: [5, 7] });
  const check = removed('kotlin/jvm/internal/Intrinsics::checkNotNull');

  it('keeps the removed check on the first and the last line and drops it on the line between', () => {
    expect([5, 6, 7].map((line) => filter(mutant({ ...check, line }), FILE))).toEqual([
      undefined,
      'null-check-intrinsic',
      undefined,
    ]);
  });
});

describe('inlined copies in a caller of a project inline function', () => {
  const caller = fn({ name: 'useClamp', start: 20, end: 22, inlineCalls: ['clampInline'] });
  const inlineFn = fn({ name: 'clampInline', start: 10, end: 12, inline: true });
  const plain = fn({ name: 'plain', class: 'demo.Other', start: 30, end: 31 });

  it('keeps a mutant past the end of the file in a class that calls an inline function, nested classes included', () => {
    const filter = filterFor({ functions: [inlineFn, caller] });

    expect([
      filter(mutant({ ...boundary, method: 'useClamp', line: 55 }), FILE),
      filter(
        mutant({ ...boundary, className: 'demo.DemoKt$run$1', method: 'invoke', line: 55 }),
        FILE,
      ),
      filter(mutant({ ...boundary, className: 'demo.Other', method: 'plain', line: 55 }), FILE),
    ]).toEqual([undefined, undefined, 'inlined-beyond-file']);
  });

  it('drops the out-of-line body of the inline function and keeps the copy in its caller on the same lines', () => {
    const filter = filterFor({ functions: [inlineFn, caller, plain] });

    expect([
      filter(mutant({ ...boundary, method: 'clampInline', line: 11 }), FILE),
      filter(mutant({ ...boundary, method: 'useClamp', line: 11 }), FILE),
    ]).toEqual(['inline-function-body', undefined]);
  });
});

describe('the out-of-line copy of an inline function that inlines another one', () => {
  const filter = filterFor({
    functions: [
      fn({ name: 'runAgain', start: 14, end: 20, inline: true, inlineCalls: ['again'] }),
      fn({ name: 'again', start: 22, end: 30, inline: true }),
    ],
  });
  const inCopy = (method, line) => filter(mutant({ ...boundary, method, line }), FILE);

  it('drops its mutants on lines past the end of the file, also in the $$forInline copy, and keeps those of a caller', () => {
    expect([
      inCopy('runAgain', 55),
      inCopy('runAgain$$forInline', 55),
      inCopy('caller', 55),
    ]).toEqual(['inline-function-body', 'inline-function-body', undefined]);
  });
});

describe('suspend lambdas with labeled returns and delegated setters', () => {
  const filter = filterFor({
    lambdas: [
      lambda({ start: 10, end: 16, valueLines: [15, 15], returnLines: [12], callee: 'async' }),
    ],
    classes: [
      {
        ...emptyClass,
        properties: [
          {
            name: 'cache',
            start: 20,
            end: 20,
            constructor: false,
            getter: false,
            setter: false,
            delegated: true,
          },
        ],
      },
    ],
  });
  const result = (line) => filter(mutant({ method: 'invokeSuspend', ...returns, line }), FILE);

  it('keeps the value of an early return@async and the final value, and drops the synthetic return on another line', () => {
    expect([result(12), result(15), result(13)]).toEqual([
      undefined,
      undefined,
      'suspend-lambda-result',
    ]);
  });

  it('keeps the setValue call of a delegated property and drops its getter return', () => {
    const inDemo = (method, overrides) =>
      filter(mutant({ className: 'demo.Demo', method, line: 20, ...overrides }), FILE);

    expect([
      inDemo('setCache', removed('kotlin/properties/ReadWriteProperty::setValue')),
      inDemo('getCache', returns),
    ]).toEqual([undefined, 'generated-accessor']);
  });
});

describe('accessor names', () => {
  const property = (name, overrides) => ({
    name,
    start: 20,
    end: 20,
    constructor: false,
    getter: false,
    setter: false,
    delegated: false,
    ...overrides,
  });
  const filter = filterFor({
    classes: [
      {
        ...emptyClass,
        properties: [property('issue'), property('isActive'), property('count')],
      },
    ],
  });
  const inDemo = (method) =>
    filter(mutant({ className: 'demo.Demo', method, line: 20, ...returns }), FILE);

  it('gives the is-form only to names like isActive and strips the module suffix of an internal accessor', () => {
    expect([
      inDemo('getIssue'),
      inDemo('setSue'),
      inDemo('issue'),
      inDemo('isActive'),
      inDemo('setActive'),
      inDemo('getCount$demo'),
    ]).toEqual([
      'generated-accessor',
      undefined,
      undefined,
      'generated-accessor',
      'generated-accessor',
      'generated-accessor',
    ]);
  });
});

describe('Unit results', () => {
  const filter = filterFor({
    functions: [
      fn({ name: 'report', start: 10, end: 14, suspend: true, returnsUnit: true }),
      fn({ name: 'load', start: 16, end: 18, suspend: true }),
      fn({ name: 'sync', start: 20, end: 22, returnsUnit: true }),
    ],
    lambdas: [
      lambda({ start: 30, end: 30, valueLines: [30, 30], callee: 'forget', discarded: true }),
      lambda({ start: 31, end: 31, valueLines: [31, 31], callee: 'again', unitCallee: true }),
      lambda({ start: 32, end: 32, valueLines: [32, 32], callee: 'custom' }),
    ],
  });
  const inDemo = (overrides) => filter(mutant({ ...returns, ...overrides }), FILE);

  it('drops a return mutant of a method whose descriptor returns kotlin.Unit', () => {
    expect([
      inDemo({ method: 'invoke', methodDescription: unitDescription }),
      inDemo({ method: 'invoke', methodDescription: '()Ljava/lang/Object;' }),
      inDemo({ method: 'invoke', methodDescription: unitDescription, ...negate }),
    ]).toEqual(['unit-result', undefined, undefined]);
  });

  it('drops the return of a suspend function that returns Unit and keeps those of other functions', () => {
    expect([
      inDemo({ className: 'demo.DemoKt', method: 'report', line: 12 }),
      inDemo({ className: 'demo.DemoKt', method: 'load', line: 17 }),
      inDemo({ className: 'demo.DemoKt', method: 'sync', line: 21 }),
      inDemo({ className: 'demo.Other', method: 'report', line: 12 }),
    ]).toEqual(['suspend-unit-result', undefined, undefined, undefined]);
  });

  it('drops the synthetic return of a lambda whose result is discarded or whose callee takes a Unit lambda and keeps that of another callee', () => {
    expect([30, 31, 32].map((line) => inDemo({ method: 'invokeSuspend', line }))).toEqual([
      'suspend-lambda-result',
      'suspend-lambda-result',
      undefined,
    ]);
  });
});

describe('default methods of an interface', () => {
  const filter = filterFor();
  const twin = { className: 'demo.Animal$DefaultImpls', method: 'sound', ...returns };

  it('drops the DefaultImpls copy only when the interface itself has a mutant for the method', () => {
    const before = filter(mutant(twin), FILE);
    filter.observe([{ className: 'demo.Animal', method: 'sound' }]);

    expect([
      before,
      filter(mutant(twin), FILE),
      filter(mutant({ ...twin, method: 'walk' }), FILE),
      filter(mutant({ ...twin, className: 'demo.Bird$DefaultImpls' }), FILE),
    ]).toEqual([undefined, 'default-impls-twin', undefined, undefined]);
  });
});

describe('@JvmStatic in a companion object', () => {
  const filter = filterFor({
    functions: [
      fn({
        name: 'create',
        class: 'demo.Registry$Companion',
        start: 8,
        end: 9,
        staticIn: 'demo.Registry',
      }),
    ],
  });
  const inClass = (className, method) =>
    filter(mutant({ className, method, line: 8, ...returns }), FILE);

  it('drops the static bridge of the outer class and keeps the companion method and other outer methods', () => {
    expect([
      inClass('demo.Registry', 'create'),
      inClass('demo.Registry$Companion', 'create'),
      inClass('demo.Registry', 'open'),
      inClass('demo.Other', 'create'),
    ]).toEqual(['jvm-static-bridge', undefined, undefined, undefined]);
  });
});

describe('a serializable class', () => {
  const filter = filterFor({
    classes: [
      {
        ...emptyClass,
        name: 'demo.Point',
        start: 5,
        headerEnd: 6,
        serializable: true,
        functions: ['describe'],
      },
    ],
  });
  const inPoint = (method, line) =>
    filter(mutant({ className: 'demo.Point', method, line, ...negate }), FILE);

  it('keeps the written function of the class and drops its generated write$Self on the header', () => {
    expect([inPoint('describe', 20), inPoint('write$Self', 5), inPoint('write$Self', 30)]).toEqual([
      undefined,
      'generated-member',
      undefined,
    ]);
  });

  it('drops the mutants of its $$serializer and keeps those of the class', () => {
    expect([
      filter(mutant({ className: 'demo.Point$$serializer', ...negate }), FILE),
      filter(mutant({ className: 'demo.Point', method: 'describe', line: 20, ...negate }), FILE),
    ]).toEqual(['serializer-class', undefined]);
  });
});
