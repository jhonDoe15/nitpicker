import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { functionUnits } from './function-units.mjs';

const unitsOf = (source) =>
  functionUnits(ts.createSourceFile('a.ts', source, ts.ScriptTarget.Latest, true)).units.map(
    ({ kind, name, start }) => `${kind} ${String(start)} ${name}`,
  );

describe('functionUnits', () => {
  it('qualifies a method by its class and a nested function by its enclosing function', () => {
    expect(
      unitsOf(
        [
          'class Store {',
          '  save() {}',
          '  get size() { return 1; }',
          '  constructor() {}',
          '}',
          'class Other { save() {} }',
          'function outer() {',
          '  function inner() {}',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      'function 2 Store.save',
      'function 3 Store.size',
      'function 4 Store.constructor',
      'function 6 Other.save',
      'function 7 outer',
      'function 8 outer.inner',
    ]);
  });

  it('names an anonymous function by its binding', () => {
    expect(
      unitsOf(
        [
          'const arrow = () => 1;',
          'const obj = { prop: () => 1, method() {}, nested: { deep: function () {} } };',
          'export default function () {}',
          'module.exports.legacy = function () {};',
          'class Widget { handler = () => 1; }',
          'const Holder = class { go() {} };',
          'const wrapped = (() => 1) as unknown;',
        ].join('\n'),
      ),
    ).toEqual([
      'function 1 arrow',
      'function 2 obj.prop',
      'function 2 obj.method',
      'function 2 obj.nested.deep',
      'function 3 default',
      'function 4 module.exports.legacy',
      'function 5 Widget.handler',
      'function 6 Holder.go',
      'function 7 wrapped',
    ]);
  });

  it('qualifies a callback by the named unit it sits in', () => {
    expect(
      unitsOf(
        [
          'function run() {',
          '  [1].map((value) => value);',
          '}',
          'setTimeout(() => {});',
          'const wire = () => [1].map(() => 1);',
        ].join('\n'),
      ),
    ).toEqual([
      'function 1 run',
      'function 2 run.<anonymous>',
      'function 4 <anonymous>',
      'function 5 wire',
      'function 5 wire.<anonymous>',
    ]);
  });

  it('makes a class field initializer and a static block units of their class', () => {
    expect(
      unitsOf(
        [
          'class Store {',
          '  mode = a ? 1 : 2;',
          '  static { init(); }',
          '  total = () => 1;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      'initializer 2 Store.mode',
      'initializer 3 Store.<static>',
      'function 4 Store.total',
    ]);
  });

  it('leaves module-level statements without a unit', () => {
    expect(unitsOf('const mode = flag ? 1 : 2;\nif (mode) { console.log(mode); }\n')).toEqual([]);
  });
});
