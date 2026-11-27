import type { TSESTree } from '@typescript-eslint/utils';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { fileCalls } from '../graph/file-calls.mts';
import { keyedUses, sharedGuards, touched } from './guard-uses.mts';

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

describe('sharedGuards', () => {
  it('finds module, class and assigned guards', () => {
    const code = [
      'const seen = new Set();',
      'export const known = new WeakMap();',
      'const plain = new Date();',
      'const other = new ns.Set();',
      'const none = 1;',
      'function inside() { const local = new Set(); }',
      'class K { field = new Map(); [key] = new Set(); bare; other = 1; setup() { this.late = new Set(); this.no = 1; other.x = new Set(); } }',
    ].join('\n');
    expect(sharedGuards(programOf(code))).toEqual(new Set(['seen', 'known', 'field', 'late']));
  });
});

describe('keyedUses and touched', () => {
  const code =
    'function walk(node, extra) { seen.add(node.id); seen.has(); seen.add(other); seen.size; seen.clear(node); this.cache.get(extra); this[x]; fn(node); }';
  const fn = [...fileCalls(programOf(code)).functions.values()][0];

  it('lists the guard calls keyed by a parameter', () => {
    const uses = fn === undefined ? [] : keyedUses(fn);
    expect(uses.map(({ guard, method, param }) => [guard, method, param])).toEqual([
      ['seen', 'add', 'node'],
      ['cache', 'get', 'extra'],
    ]);
  });

  it('lists the names a function touches', () => {
    expect(fn === undefined ? new Set<string>() : touched(fn)).toEqual(
      new Set(['node', 'seen', 'cache']),
    );
  });
});
