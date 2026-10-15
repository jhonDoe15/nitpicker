import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { describeFunctions } from './describe.mjs';

function describeSource(source) {
  const sourceFile = ts.createSourceFile(
    'sample.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return describeFunctions(sourceFile).map(({ displayName, startLine, endLine, complexity }) => [
    displayName,
    startLine,
    endLine,
    complexity,
  ]);
}

describe('function descriptors', () => {
  it('names functions by their container and the way they are assigned', () => {
    const source = [
      'export class Counter {',
      '  static create() { return 1; }',
      '  constructor(step) { if (step) { this.step = step; } }',
      '  get value() { return 1; }',
      '  set value(next) { this.next = next ?? 0; }',
      '  #reset() { return 2; }',
      '  handler = (event) => event?.delta;',
      "  ['a' + 'b']() { return 3; }",
      '}',
      'export default function (flag) { return flag ? 1 : 2; }',
      'const registry = {',
      '  run() { return 1; },',
      '  nested: { deep() { return 2; }, lazy: () => 3 },',
      '};',
      'const holder = {};',
      'holder.fn = function () { return 1; };',
      "holder['key'] = () => 2;",
      'module.exports.pick = (flag) => flag && 1;',
      'unknownCall().x = () => 4;',
      'export function overloaded(value: string): string;',
      'export function overloaded(value: number): number;',
      'export function overloaded(value: string | number) { return value; }',
      '[1].map((item) => item + 1);',
    ].join('\n');

    expect(describeSource(source)).toEqual([
      ['Counter.create', 2, 2, 1],
      ['Counter.constructor', 3, 3, 2],
      ['Counter.get value', 4, 4, 1],
      ['Counter.set value', 5, 5, 2],
      ['Counter.#reset', 6, 6, 1],
      ['Counter.handler', 7, 7, 2],
      ["Counter['a' + 'b']", 8, 8, 1],
      ['default', 10, 10, 2],
      ['registry.run', 12, 12, 1],
      ['registry.nested.deep', 13, 13, 1],
      ['registry.nested.lazy', 13, 13, 1],
      ['holder.fn', 16, 16, 1],
      ["holder['key']", 17, 17, 1],
      ['module.exports.pick', 18, 18, 2],
      ['<assigned>', 19, 19, 1],
      ['overloaded', 22, 22, 1],
    ]);
  });

  it('counts branches, loops, catches, cases, short circuits and optional chains but not nested functions', () => {
    const source = [
      'function measured(a, b, items) {',
      '  if (a) { return 1; }',
      '  for (const item of items) { while (item) { do { a += 1; } while (a < 3); } }',
      '  for (const key in b) { a = b[key] ?? a; }',
      '  for (let index = 0; index < 2; index += 1) { a = a && b || a; }',
      '  switch (a) { case 1: return 1; case 2: return 2; default: return 3; }',
      '  try { a = b?.c?.[0]?.(); } catch (error) { a = error ? 1 : 2; }',
      '  items.forEach((item) => { if (item) { a += 1; } });',
      '  return a;',
      '}',
    ].join('\n');

    expect(describeSource(source)).toEqual([['measured', 1, 10, 17]]);
  });
});
