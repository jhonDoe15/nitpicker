import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../../core/diff/comparison/compare.mjs';
import { withoutGeneratedSources } from '../../../generated/generated-sources.mjs';
import {
  argument,
  file,
  fn,
  klass,
  parameter,
  routed,
  routeOf,
  run,
  summary,
} from '../test-support/facts.mjs';
import { METHOD_ALIAS_RULE, methodAliasFindings } from './method-aliases.mjs';

const forward = (name, args, overrides = {}) => ({
  name,
  qualifier: undefined,
  typeArguments: false,
  arguments: args.map((text) => argument(text)),
  ...overrides,
});
const params = (...names) => names.map((name) => parameter(name, 'Int'));
const sum = (overrides = {}) =>
  fn('sum', { owner: 'Cart', parameters: params('items'), returnType: 'Int', ...overrides });
const total = (overrides = {}) =>
  fn('total', {
    line: 5,
    owner: 'Cart',
    parameters: params('items'),
    returnType: 'Int',
    forward: forward('sum', ['items']),
    ...overrides,
  });
const cart = klass('Cart');

const findingsFor = (functions, classes = [cart], overrides = {}) =>
  run(methodAliasFindings, [file({ functions, classes, ...overrides })]);

describe('method alias in Kotlin', () => {
  it('reports a member that only passes its parameters to another member of its class', () => {
    const findings = findingsFor([sum(), total()]);

    expect(summary(findings)).toEqual([`${METHOD_ALIAS_RULE} Cart.total 5`]);
    expect(findings[0].tool).toBe('pmd');
    expect(findings[0].message).toBe(
      routed(
        'This method only passes its parameters, in order, to another method of the same class. Call that method directly and delete the alias.',
        METHOD_ALIAS_RULE,
      ),
    );
    expect(routeOf(findings[0].message)).toBe(
      'If this is intended, add {"rule":"pmd/ForwardingMethodAlias","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    ['an explicit this receiver', { forward: forward('sum', ['items'], { qualifier: 'this' }) }],
    ['a target declared before it', { line: 1 }],
    [
      'a named argument',
      {
        forward: {
          ...forward('sum', ['items']),
          arguments: [argument('items', { name: 'items' })],
        },
      },
    ],
    ['a suspend pair', { modifiers: ['suspend'] }],
  ])('reports %s', (_name, overrides) => {
    const target = overrides.modifiers === undefined ? sum() : sum({ modifiers: ['suspend'] });

    expect(summary(findingsFor([total(overrides), target]))).toEqual([
      `${METHOD_ALIAS_RULE} Cart.total ${String(overrides.line ?? 5)}`,
    ]);
  });

  it('reports a member of an enum and an object that calls through this', () => {
    const enumeration = klass('Cart', { kind: 'enum' });
    const registry = klass('Cart', { kind: 'object' });
    const through = { forward: forward('sum', ['items'], { qualifier: 'this' }) };

    expect(summary(findingsFor([sum(), total()], [enumeration]))).toHaveLength(1);
    expect(summary(findingsFor([sum(), total(through)], [registry]))).toHaveLength(1);
  });

  it.each([
    [
      'arguments in another order',
      { parameters: params('a', 'b'), forward: forward('sum', ['b', 'a']) },
    ],
    ['an extra argument', { forward: forward('sum', ['items', '1']) }],
    ['a changed argument', { forward: forward('sum', ['items.size']) }],
    ['a call on another instance', { forward: forward('sum', ['items'], { qualifier: 'other' }) }],
    ['a call to itself', { forward: forward('total', ['items']) }],
    ['a call to a function outside the class', { forward: forward('missing', ['items']) }],
    ['a factory named of', { name: 'of' }],
    ['a factory named from', { name: 'from' }],
    ['a default parameter', { parameters: [parameter('items', 'Int', { default: true })] }],
    ['a vararg parameter', { parameters: [parameter('items', 'Int', { vararg: true })] }],
    ['a type parameter', { typeParameters: true }],
    ['a deprecated alias', { annotations: ['Deprecated'] }],
    ['an annotation', { annotations: ['JvmName'] }],
    ['an override', { modifiers: ['override'] }],
    ['an operator', { modifiers: ['operator'] }],
    ['an infix function', { modifiers: ['infix'] }],
    ['an open member', { modifiers: ['open'] }],
    ['an inline member', { modifiers: ['inline'] }],
    ['an extension receiver', { receiver: 'String' }],
    ['a call with type arguments', { forward: forward('sum', ['items'], { typeArguments: true }) }],
    ['a suspend alias of a plain target', { modifiers: ['suspend'] }],
    ['a different return type', { returnType: 'Long' }],
    ['no parameters', { parameters: [], forward: forward('sum', []) }],
    ['no body call', { forward: undefined }],
    ['a local function', { local: true }],
  ])('allows %s', (_name, overrides) => {
    expect(findingsFor([sum(), total(overrides)])).toEqual([]);
  });

  it('allows a target with other parameter types, a receiver, type parameters or overloads', () => {
    const other = sum({ parameters: [parameter('items', 'Long')] });

    expect(findingsFor([total(), other])).toEqual([]);
    expect(findingsFor([total(), sum({ receiver: 'String' })])).toEqual([]);
    expect(findingsFor([total(), sum({ typeParameters: true })])).toEqual([]);
    expect(findingsFor([total(), sum(), sum({ parameters: params('items', 'more') })])).toEqual([]);
    expect(findingsFor([total(), total({ line: 9 }), sum()])).toEqual([]);
  });

  it('allows a function outside a class, in an interface, a local class or an object calling implicitly', () => {
    const topLevel = [total({ owner: '' }), sum({ owner: '' })];

    expect(findingsFor(topLevel, [])).toEqual([]);
    expect(findingsFor([sum(), total()], [klass('Cart', { kind: 'interface' })])).toEqual([]);
    expect(findingsFor([sum(), total()], [klass('Cart', { local: true })])).toEqual([]);
    expect(findingsFor([sum(), total()], [klass('Cart', { kind: 'object' })])).toEqual([]);
    expect(findingsFor([sum(), total()], [klass('Cart', { kind: 'companion' })])).toEqual([]);
  });

  it('allows a target that lives in another class with the same method name', () => {
    expect(findingsFor([total(), sum({ owner: 'Basket' })], [cart, klass('Basket')])).toEqual([]);
  });

  it('ignores test sources', () => {
    expect(
      run(methodAliasFindings, [
        file({
          file: 'src/test/kotlin/demo/CartTest.kt',
          test: true,
          functions: [sum(), total()],
          classes: [cart],
        }),
      ]),
    ).toEqual([]);
  });
});

describe('method alias identity and generated sources', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  const identitiesFor = (line) =>
    findingsFor([sum({ line: 1 }), total({ line })]).map(({ identity }) => identity);

  it('keeps the identity when the alias moves to another line', () => {
    expect(identitiesFor(5)).toEqual(identitiesFor(40));
  });

  it('keeps the finding baselined when lines move and reports a second alias as new', () => {
    const base = findingsFor([sum(), total({ line: 5 })]);
    const head = findingsFor([
      sum(),
      total({ line: 12 }),
      sum({ name: 'count' }),
      total({ name: 'size', line: 20, forward: forward('count', ['items']) }),
    ]);
    const result = compareFindings({ baseFindings: base, headFindings: head });

    expect(result.newFindings.map(({ symbol }) => symbol)).toEqual(['Cart.size']);
    expect(result.unchangedFindings.map(({ symbol }) => symbol)).toEqual(['Cart.total']);
  });

  it('drops findings in generated sources with the other findings of the Kotlin preset', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-alias-')));
    roots.push(root);
    const generated = 'build/generated/ksp/main/kotlin/demo/Cart.kt';
    const header = 'src/main/kotlin/demo/Header.kt';
    const handWritten = 'src/main/kotlin/demo/Hand.kt';
    for (const [name, text] of [
      [generated, 'package demo\n'],
      [header, '// Code generated by Wire protocol buffer compiler, do not edit.\npackage demo\n'],
      [handWritten, 'package demo\n'],
    ]) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), text);
    }
    const facts = [generated, header, handWritten].map((name) =>
      file({ file: name, functions: [sum(), total()], classes: [cart] }),
    );
    const findings = run(methodAliasFindings, facts);

    expect(findings).toHaveLength(3);
    expect(withoutGeneratedSources(findings, root).map(({ path: found }) => found)).toEqual([
      handWritten,
    ]);
  });
});
