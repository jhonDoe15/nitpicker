import { describe, expect, it } from 'vitest';
import {
  blockEnd,
  candidateBlocks,
  declarationsIn,
  importSpecifier,
  languageOf,
  largest,
  linesOf,
} from './source.mjs';

const TYPESCRIPT = [
  'export function first(a) {',
  '  if (a) {',
  "    return '}';",
  '  }',
  '  return 1;',
  '}',
  '',
  'export class Box {',
  '  size() {',
  '    return 2;',
  '  }',
  '}',
].join('\n');

describe('languageOf', () => {
  it.each([
    ['a/b.ts', 'typescript'],
    ['a/b.mjs', 'typescript'],
    ['A.java', 'java'],
    ['A.kt', 'kotlin'],
    ['a.py', 'python'],
    ['a.go', 'go'],
    ['a.txt', undefined],
  ])('names the language of %s', (file, language) => {
    expect(languageOf(file)).toBe(language);
  });
});

describe('blockEnd', () => {
  it('ends a brace block at its closing brace and ignores braces in strings', () => {
    expect(blockEnd(linesOf(TYPESCRIPT), 1, 'typescript')).toBe(6);
    expect(blockEnd(linesOf(TYPESCRIPT), 8, 'typescript')).toBe(12);
  });

  it('ends an indented block before the next line that is not indented deeper', () => {
    const lines = ['def a():', '    x = 1', '', '    return x', 'def b():', '    pass'];

    expect(blockEnd(lines, 1, 'python')).toBe(4);
  });

  it('ends a line without braces on that line', () => {
    expect(blockEnd(['const a = 1;', 'const b = 2;'], 1, 'typescript')).toBe(1);
  });

  it('keeps a line outside the file', () => {
    expect(blockEnd(['a'], 9, 'python')).toBe(9);
  });
});

describe('declarationsIn', () => {
  it('lists the top-level declarations with their lines, and the members at an indent', () => {
    const lines = linesOf(TYPESCRIPT);

    expect(declarationsIn(lines, { language: 'typescript' })).toEqual([
      { name: 'first', startLine: 1, endLine: 6 },
      { name: 'Box', startLine: 8, endLine: 12 },
    ]);
    expect(declarationsIn(lines, { language: 'typescript', from: 9, to: 11, indent: 2 })).toEqual(
      [],
    );
  });

  it('reads Python, Java, Kotlin and Go declarations', () => {
    expect(declarationsIn(['class A:', '    pass'], { language: 'python' })[0].name).toBe('A');
    expect(declarationsIn(['public class A {', '}'], { language: 'java' })[0].name).toBe('A');
    expect(
      declarationsIn(['internal data class A(val b: Int)'], { language: 'kotlin' })[0].name,
    ).toBe('A');
    expect(declarationsIn(['func (s *S) Run() {', '}'], { language: 'go' })[0].name).toBe('Run');
    expect(declarationsIn(['x'], { language: 'unknown' })).toEqual([]);
  });

  it('orders the largest first', () => {
    const found = largest(
      [
        { name: 'a', startLine: 1, endLine: 2 },
        { name: 'b', startLine: 3, endLine: 9 },
      ],
      1,
    );

    expect(found).toEqual([{ name: 'b', startLine: 3, endLine: 9, lines: 7 }]);
  });
});

describe('candidateBlocks', () => {
  it('lists the largest blank-line separated blocks of a body in line order', () => {
    const lines = [
      'function f() {',
      '  a();',
      '  b();',
      '  c();',
      '',
      '  d();',
      '',
      '  e();',
      '  g();',
      '  h();',
      '  i();',
      '}',
    ];

    expect(candidateBlocks(lines, { startLine: 1, endLine: 12 })).toEqual([
      { startLine: 2, endLine: 4 },
      { startLine: 8, endLine: 11 },
    ]);
  });
});

describe('importSpecifier', () => {
  it.each([
    ["import { a } from './a.js';", './a.js'],
    ["const a = require('pkg');", 'pkg'],
    ['import java.util.List;', 'java.util.List'],
    ['from pkg.mod import name', 'pkg.mod'],
    ['import os', 'os'],
    ['import "fmt"', 'fmt'],
    ['const a = 1;', undefined],
    [undefined, undefined],
  ])('reads %s', (line, specifier) => {
    expect(importSpecifier(line)).toBe(specifier);
  });
});
