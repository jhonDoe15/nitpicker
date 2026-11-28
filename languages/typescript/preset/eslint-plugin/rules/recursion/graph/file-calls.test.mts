import type { TSESTree } from '@typescript-eslint/utils';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import {
  callsFrom,
  descendants,
  enclosingOwner,
  fileCalls,
  isRecursive,
  methodCall,
  reachable,
  type FileCalls,
} from './file-calls.mts';

function isProgram(value: unknown): value is TSESTree.Program {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'Program';
}

function programOf(code: string): TSESTree.Program {
  const captured: unknown[] = [];
  const messages = new Linter().verify(
    code,
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser },
      plugins: {
        probe: {
          rules: { grab: { create: () => ({ 'Program:exit': (node) => captured.push(node) }) } },
        },
      },
      rules: { 'probe/grab': 'error' },
    },
    'probe.ts',
  );
  const [fatal] = messages.filter(({ fatal }) => fatal);
  if (fatal !== undefined) {
    throw new TypeError(fatal.message);
  }
  const [program] = captured;
  if (isProgram(program)) {
    return program;
  }
  throw new TypeError('The parser did not return a program.');
}

function callIn(code: string, text: string): TSESTree.CallExpression {
  const found = descendants(programOf(code)).find(
    (node): node is TSESTree.CallExpression =>
      node.type === 'CallExpression' && code.slice(node.range[0], node.range[1]) === text,
  );
  if (found === undefined) {
    throw new TypeError(`No call ${text}`);
  }
  return found;
}

const SOURCE = [
  'export function a(x) { return b(x); }',
  'function b(y) { return a(y); }',
  'const c = (z) => c(z);',
  'let d;',
  'function outer() { function inner() {} }',
  'class K { constructor(private readonly p, { q } = {}) {} static {} [k]() {} v; run(n) { return this.run(n); } #hid() { return this.#hid(); } }',
  'const E = class { m() {} };',
  'export default function () {}',
  'export function list(items) { return items.map(h); }',
  'function h() {}',
].join('\n');

describe('fileCalls', () => {
  const graph = fileCalls(programOf(SOURCE));
  const owner = `K@${String(SOURCE.indexOf('class K'))}`;
  const anonymous = `class@${String(SOURCE.indexOf('class {'))}`;

  it('lists the module functions and the class members that hold a function', () => {
    expect([...graph.functions.keys()].filter((key) => !key.endsWith('#hid')).sort()).toEqual(
      [
        '#a',
        '#b',
        '#c',
        '#outer',
        '#list',
        '#h',
        `${owner}#constructor`,
        `${owner}#run`,
        `${anonymous}#m`,
      ].sort(),
    );
  });

  it('names the parameters of a function, skipping patterns', () => {
    expect(graph.functions.get(`${owner}#constructor`)?.params).toEqual(new Set(['p']));
    expect(graph.functions.get('#a')?.params).toEqual(new Set(['x']));
  });

  it('records the calls between the functions of the file', () => {
    expect(graph.calls.get('#a')).toEqual(new Set(['#b']));
    expect(graph.calls.get('#c')).toEqual(new Set(['#c']));
    expect(graph.calls.get('#list')).toEqual(new Set(['#h']));
  });

  it('finds the functions that reach themselves', () => {
    expect(isRecursive(graph, '#a')).toBe(true);
    expect(isRecursive(graph, '#outer')).toBe(false);
  });
});

describe('call graph lookups', () => {
  const graph: FileCalls = {
    functions: new Map(),
    calls: new Map([['x', new Set(['y'])]]),
  };

  it('treats a key without recorded calls as calling nothing', () => {
    expect(callsFrom(graph, 'missing').size).toBe(0);
    expect(reachable(graph, 'missing').size).toBe(0);
    expect(reachable(graph, 'x')).toEqual(new Set(['y']));
  });
});

describe('enclosingOwner', () => {
  const code = 'class K { run() { return go(); } }\nfree();';

  it('names the class around a call and is empty at module level', () => {
    expect(enclosingOwner(callIn(code, 'go()'))).toMatch(/^K@0$/u);
    expect(enclosingOwner(callIn(code, 'free()'))).toBe('');
  });
});

describe('methodCall', () => {
  it('describes a call of a named method on a receiver', () => {
    expect(methodCall(callIn('a.b();', 'a.b()'))).toEqual({ receiver: 'a', method: 'b' });
    expect(methodCall(callIn('this.x.b();', 'this.x.b()'))).toEqual({ receiver: 'x', method: 'b' });
    expect(methodCall(callIn('f().b();', 'f().b()'))).toEqual({ receiver: '', method: 'b' });
    expect(methodCall(callIn('this.#p();', 'this.#p()'))).toEqual({ receiver: '', method: 'p' });
  });

  it('ignores calls that are not plain method calls', () => {
    expect(methodCall(callIn('f();', 'f()'))).toBeUndefined();
    expect(methodCall(callIn('a[b]();', 'a[b]()'))).toBeUndefined();
    const program = programOf('f();');
    expect(methodCall(program)).toBeUndefined();
  });
});
