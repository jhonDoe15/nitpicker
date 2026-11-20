import { describe, expect, it } from 'vitest';
import { byId, factsOfFiles } from '../../test-support/project.mts';

describe('facts that do not depend on the order a compiler lists things in', () => {
  const facts = factsOfFiles({
    'src/base.ts': ['export class Base {', '  held: string[] = [];', '  late = 0;', '}', ''].join(
      '\n',
    ),
    'src/a-shape.ts': [
      "import { Base } from './base';",
      'export interface Tail { zeta: string }',
      'export interface Shape extends Tail { alpha: number }',
      'export class Child extends Base {',
      '  own = 1;',
      '  constructor() { super(); this.held = []; this.late = 2; }',
      '}',
      '',
    ].join('\n'),
    'src/calls.ts': [
      "export function pick(kind: 'b' | 'a' | undefined, shape: { z: 'y' | 'x'; a: number }): void {",
      '  void kind; void shape;',
      '}',
      '/** @returns {number} */',
      'export function undeclared() { return 1; }',
      "export function nested(run: (value: 'q' | 'p') => 'n' | 'm'): Array<'t' | 's'> {",
      '  void run; return [];',
      '}',
      '',
    ].join('\n'),
  });

  it('writes the members of a union and of an object type in one order', () => {
    expect(byId(facts.callables, 'src/calls.ts#pick').params).toEqual([
      { name: 'kind', type: '"a"|"b"' },
      { name: 'shape', type: '{a:number;z:"x"|"y";}' },
    ]);
    expect(byId(facts.callables, 'src/calls.ts#nested').params).toEqual([
      { name: 'run', type: '(value:"p"|"q")=>"m"|"n"' },
    ]);
    expect(byId(facts.callables, 'src/calls.ts#nested').returns).toBe('("s"|"t")[]');
  });

  it('reads no return type from a comment of a TypeScript file', () => {
    expect(byId(facts.callables, 'src/calls.ts#undeclared').returns).toBeUndefined();
  });

  it('lists fields by where they are declared: by file, then by position', () => {
    expect(byId(facts.types, 'src/a-shape.ts#Shape').fields).toEqual([
      { name: 'zeta' },
      { name: 'alpha' },
    ]);
    expect(byId(facts.types, 'src/a-shape.ts#Child').fields).toEqual([
      { name: 'own' },
      { name: 'held', mutable: true },
      { name: 'late' },
    ]);
  });

  it('finds the types a reference line names, as the config of the project does', () => {
    const typed = factsOfFiles({
      'node_modules/@types/thing/index.d.ts':
        'declare namespace thing { interface Part { size: 1 } }\n',
      'node_modules/@types/thing/package.json': { name: '@types/thing', version: '1.0.0' },
      'src/use.ts': [
        '/// <reference types="thing" />',
        'export function measure(part: thing.Part): void { void part; }',
        '',
      ].join('\n'),
    });

    expect(byId(typed.callables, 'src/use.ts#measure').params).toEqual([
      { name: 'part', type: 'Part' },
    ]);
  });
});
