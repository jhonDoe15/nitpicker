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

describe('rules that need no source facts', () => {
  const filter = filterFor();

  it.each([
    ['coroutine-throw-on-failure', removed('kotlin/ResultKt::throwOnFailure')],
    ['null-check-intrinsic', removed('kotlin/jvm/internal/Intrinsics::checkNotNullParameter')],
    [
      'null-check-intrinsic',
      removed('kotlin/jvm/internal/Intrinsics::checkNotNullExpressionValue'),
    ],
    ['null-check-intrinsic', removed('kotlin/jvm/internal/Intrinsics::checkNotNull')],
    ['inline-marker', removed('kotlin/jvm/internal/InlineMarker::mark')],
    ['when-mappings', { className: 'demo.DemoKt$WhenMappings', ...returns }],
    [
      'synthetic-accessor',
      { className: 'demo.Account', method: 'access$getBalance$p', ...returns },
    ],
    ['serializer-class', { className: 'demo.Point$$serializer', ...negate }],
    ['compose-generated', { className: 'demo.ComposableSingletons$DemoKt', ...returns }],
    ['compose-generated', removed('androidx/compose/runtime/Composer::startRestartGroup')],
  ])('drops %s', (rule, overrides) => {
    expect(filter(mutant(overrides), FILE)).toBe(rule);
  });

  it.each([
    ['a call of written code', removed('java/io/StringReader::close')],
    ['a call that spreads an argument', removed('kotlin/jvm/internal/SpreadBuilder::addSpread')],
    ['a written call named like the coroutine one', removed('kotlin/Result::getOrThrow')],
    ['a composable the project calls', removed('demo/ScreenKt::Screen')],
    [
      'a runtime composable the project calls',
      removed('androidx/compose/runtime/EffectsKt::SideEffect'),
    ],
    [
      'a method that only looks like an accessor bridge',
      { className: 'demo.Account', method: 'accessLevel', ...returns },
    ],
    ['a class that only looks generated', { className: 'demo.WhenMappingsTest', ...returns }],
  ])('keeps %s', (name, overrides) => {
    expect(filter(mutant(overrides), FILE)).toBeUndefined();
  });

  it('keeps the removal of a !! check, which is written code, and drops it on a line without !!', () => {
    const withBang = filterFor({ bang: [5] });
    const call = removed('kotlin/jvm/internal/Intrinsics::checkNotNull');

    expect([withBang(mutant(call), FILE), withBang(mutant({ ...call, line: 6 }), FILE)]).toEqual([
      undefined,
      'null-check-intrinsic',
    ]);
  });

  it('keeps a $WhenMappings class that the project declared itself', () => {
    const own = filterFor({ classes: [{ ...emptyClass, name: 'demo.DemoKt$WhenMappings' }] });

    expect(
      own(mutant({ className: 'demo.DemoKt$WhenMappings', ...returns }), FILE),
    ).toBeUndefined();
  });
});

const suspendDescription = '(ILkotlin/coroutines/Continuation;)Ljava/lang/Object;';

describe('state-machine-branch', () => {
  const filter = filterFor({ branching: [26, 31] });
  const inSuspend = { method: 'fetch', methodDescription: suspendDescription };

  it.each([
    ['a negated label check in a suspend function', { ...inSuspend, ...negate, line: 23 }],
    ['a boundary change in a suspend lambda', { method: 'invokeSuspend', ...boundary, line: 24 }],
  ])('drops %s on a line without branching syntax', (name, overrides) => {
    expect(filter(mutant(overrides), FILE)).toBe('state-machine-branch');
  });

  it.each([
    ['an if the developer wrote in a suspend function', { ...inSuspend, ...negate, line: 26 }],
    ['a loop condition on a line with a loop', { method: 'invokeSuspend', ...negate, line: 31 }],
    [
      'a conditional of an ordinary function',
      { method: 'plain', methodDescription: '(I)I', ...negate, line: 23 },
    ],
    [
      'a removed call in a suspend function',
      { ...inSuspend, ...removed('demo/Log::write'), line: 23 },
    ],
  ])('keeps %s', (name, overrides) => {
    expect(filter(mutant(overrides), FILE)).toBeUndefined();
  });
});

describe('suspend-lambda-result', () => {
  const lambdas = [
    lambda({ start: 10, end: 20, valueLines: [18, 18], callee: 'withContext' }),
    lambda({ start: 12, end: 14, valueLines: [13, 13], callee: 'async' }),
    lambda({ start: 15, end: 15, valueLines: [15, 15], callee: 'launch' }),
  ];
  const filter = filterFor({ lambdas });
  const result = (line, overrides) =>
    filter(mutant({ method: 'invokeSuspend', ...returns, line, ...overrides }), FILE);

  it('drops the synthetic return of a lambda, of a builder that returns Unit and of a continuation class', () => {
    expect([result(20), result(15), result(30), result(12)]).toEqual([
      'suspend-lambda-result',
      'suspend-lambda-result',
      'suspend-lambda-result',
      'suspend-lambda-result',
    ]);
  });

  it('keeps the return value of the lambda of async, which a test can read', () => {
    expect(result(13)).toBeUndefined();
  });

  it('keeps the value of an inner lambda that a test could read, not the outer lambda starting on the same line', () => {
    expect([result(18), result(10)]).toEqual([undefined, 'suspend-lambda-result']);
  });

  it('keeps return mutants of a method that is not invokeSuspend', () => {
    expect(result(20, { method: 'load' })).toBeUndefined();
  });
});

describe('generated accessors and members', () => {
  const holder = {
    ...emptyClass,
    name: 'demo.Holder',
    start: 8,
    headerEnd: 9,
    functions: ['label', 'describe'],
    properties: [
      {
        name: 'items',
        start: 8,
        end: 8,
        constructor: true,
        getter: false,
        setter: false,
        delegated: false,
      },
      {
        name: 'size',
        start: 9,
        end: 9,
        constructor: true,
        getter: false,
        setter: false,
        delegated: false,
      },
      {
        name: 'title',
        start: 12,
        end: 14,
        constructor: false,
        getter: true,
        setter: false,
        delegated: false,
      },
      {
        name: 'cache',
        start: 16,
        end: 16,
        constructor: false,
        getter: false,
        setter: false,
        delegated: true,
      },
      {
        name: 'isActive',
        start: 18,
        end: 18,
        constructor: false,
        getter: false,
        setter: false,
        delegated: false,
      },
    ],
  };
  const filter = filterFor({ classes: [holder] });
  const inHolder = (method, line, overrides) =>
    filter(mutant({ className: 'demo.Holder', method, line, ...returns, ...overrides }), FILE);

  it.each([
    ['the getter of a constructor property', 'getItems', 8, 'generated-accessor'],
    ['the getter of a property on another line of the header', 'getSize', 9, 'generated-accessor'],
    ['the getter of a delegated property', 'getCache', 16, 'generated-accessor'],
    ['the getter of a Boolean property named is...', 'isActive', 18, 'generated-accessor'],
    ['a copy of a data class that wrote no copy', 'copy', 8, 'generated-member'],
    ['a bridge to an interface default method', 'sound', 9, 'generated-member'],
    ['a component function', 'component2', 9, 'generated-member'],
  ])('drops %s', (name, method, line, rule) => {
    expect(inHolder(method, line)).toBe(rule);
  });

  it.each([
    ['a getter the developer wrote', 'getTitle', 13],
    ['a getter named like a property but on a line of real code', 'getItems', 30],
    ['a function the developer wrote on the header line', 'label', 8],
    ['the constructor, whose defaults are written code', '<init>', 8],
    ['a written function', 'describe', 40],
    ['a method of another class', 'getItems', 8, { className: 'demo.Other' }],
  ])('keeps %s', (name, method, line, overrides) => {
    expect(inHolder(method, line, overrides)).toBeUndefined();
  });
});

describe('value classes, inline functions and default arguments', () => {
  const meters = {
    ...emptyClass,
    name: 'demo.Meters',
    kind: 'value',
    start: 3,
    headerEnd: 4,
    functions: ['doubled'],
  };
  const checked = { ...meters, name: 'demo.Checked', init: true };
  const filter = filterFor({
    classes: [meters, checked],
    functions: [
      fn({ name: 'twice', start: 10, end: 12, inline: true }),
      fn({ name: 'plain', start: 14, end: 16 }),
    ],
    branching: [21],
  });
  const at = (overrides) => filter(mutant({ ...returns, ...overrides }), FILE);

  it.each([
    [
      'the box of a value class',
      'value-class-member',
      { className: 'demo.Meters', method: 'box-impl', line: 30 },
    ],
    [
      'the equals of a value class that wrote none',
      'value-class-member',
      { className: 'demo.Meters', method: 'equals-impl', line: 30 },
    ],
    [
      'the constructor of a value class without an init block',
      'value-class-member',
      { className: 'demo.Meters', method: 'constructor-impl', line: 30 },
    ],
    [
      'the out-of-line body of an inline function',
      'inline-function-body',
      { method: 'twice', line: 11 },
    ],
    [
      'the out-of-line copy of a suspend inline function',
      'inline-function-body',
      { method: 'twice$$forInline', line: 11 },
    ],
    [
      'a mutant of code inlined from another file, on a line past the end of this one',
      'inlined-beyond-file',
      { method: 'caller', line: 55 },
    ],
    [
      'the out-of-line body of an inline function with defaults',
      'inline-function-body',
      { method: 'twice$default', line: 10 },
    ],
  ])('drops %s', (name, rule, overrides) => {
    expect(at(overrides)).toBe(rule);
  });

  it.each([
    [
      'a method the developer wrote in a value class',
      { className: 'demo.Meters', method: 'doubled-1a2b3c4', line: 5 },
    ],
    [
      'the constructor check of a value class with an init block',
      { className: 'demo.Checked', method: 'constructor-impl', line: 30 },
    ],
    ['an ordinary function on the lines of an inline one', { method: 'plain', line: 15 }],
    ['an inline function of another class', { className: 'demo.Other', method: 'twice', line: 11 }],
    ['a call of the inline function, inlined into its caller', { method: 'caller', line: 11 }],
    ['the last line of the file', { method: 'caller', line: 40 }],
  ])('keeps %s', (name, overrides) => {
    expect(at(overrides)).toBeUndefined();
  });

  it('drops the mask check of a default-argument stub and keeps the default value and a branching default', () => {
    const stub = {
      method: 'greet$default',
      methodDescription: '(Ljava/lang/String;ILjava/lang/Object;)V',
    };

    expect([
      at({ ...stub, ...negate, line: 20 }),
      at({
        ...stub,
        mutatorName: 'MathMutator',
        description: 'Replaced integer addition with subtraction',
        line: 20,
      }),
      at({ ...stub, ...negate, line: 21 }),
    ]).toEqual(['default-argument-stub', undefined, undefined]);
  });
});
