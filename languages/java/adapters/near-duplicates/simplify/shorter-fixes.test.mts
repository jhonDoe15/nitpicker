import { beforeAll, describe, expect, it } from 'vitest';
import { jvmGrammars, type JvmGrammar } from '../test-support/parse-jvm.mts';
import { shorterFixes } from './shorter-fixes.mts';

const grammars: { java?: JvmGrammar; kotlin?: JvmGrammar } = {};

beforeAll(async () => {
  Object.assign(grammars, await jvmGrammars());
});

function fixed(text: string, file = 'src/main/java/shop/Rules.java') {
  const grammar = file.endsWith('.kt') ? grammars.kotlin : grammars.java;
  if (grammar === undefined) {
    throw new Error('grammars are not loaded');
  }
  const fixes = shorterFixes(grammar, { file, text });
  const edits = fixes.flatMap(({ edits: list }) => list).toSorted((a, b) => b.start - a.start);
  return {
    lines: fixes.map(({ finding }) => finding.line),
    after: edits.reduce(
      (result, e) => `${result.slice(0, e.start)}${e.text}${result.slice(e.end)}`,
      text,
    ),
  };
}

function inClass(...lines: string[]): string {
  return ['class Rules {', ...lines, '}'].join('\n');
}

describe('shorterFixes on Java', () => {
  it('replaces each shorter condition with its form at the finding line', () => {
    const text = inClass(
      '  boolean both(int n) { return n > 3 && n > 5; }',
      '  boolean same(boolean a, boolean b) { return (a && b) || (a && !b); }',
      '  boolean span(int x) { return (x >= 0 && x < 10) || (x >= 10 && x < 20); }',
    );

    expect(fixed(text)).toEqual({
      lines: [2, 3, 4],
      after: inClass(
        '  boolean both(int n) { return n > 5; }',
        '  boolean same(boolean a, boolean b) { return a; }',
        '  boolean span(int x) { return x >= 0 && x < 20; }',
      ),
    });
  });

  it('keeps the form in parentheses where an operator wraps the condition', () => {
    const text = inClass('  boolean wrapped(int n, boolean f) { return f == (n > 3 && n > 5); }');

    expect(fixed(text).after).toBe(
      inClass('  boolean wrapped(int n, boolean f) { return f == (n > 5); }'),
    );
  });

  it('rewrites a condition of an if statement inside its own parentheses', () => {
    const text = inClass(
      '  int pick(int n) {',
      '    if (n > 3 && n > 5) { return 1; }',
      '    return 0;',
      '  }',
    );

    expect(fixed(text).after).toBe(
      inClass('  int pick(int n) {', '    if (n > 5) { return 1; }', '    return 0;', '  }'),
    );
  });

  it('declines a condition that holds a comment', () => {
    const text = inClass('  boolean both(int n) { return n > 3 /* low */ && n > 5; }');

    expect(fixed(text)).toEqual({ lines: [], after: text });
  });

  it('declines a condition whose text repeats on the same line', () => {
    const text = inClass('  boolean twice(int n) { return (n > 3 && n > 5) == (n > 3 && n > 5); }');

    expect(fixed(text).lines).toEqual([]);
  });

  it('leaves code without a shorter condition alone', () => {
    const text = inClass('  boolean plain(int n, int m) { return n > 3 && m > 5; }');

    expect(fixed(text)).toEqual({ lines: [], after: text });
  });
});

describe('shorterFixes on Kotlin', () => {
  it('replaces a shorter condition in a Kotlin function', () => {
    const text = 'class Rules {\n  fun both(n: Int): Boolean = n > 3 && n > 5\n}\n';

    expect(fixed(text, 'src/main/kotlin/shop/Rules.kt').after).toBe(
      'class Rules {\n  fun both(n: Int): Boolean = n > 5\n}\n',
    );
  });
});
