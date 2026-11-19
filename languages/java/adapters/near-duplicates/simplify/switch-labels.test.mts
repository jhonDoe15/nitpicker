import { beforeAll, describe, expect, it } from 'vitest';
import { jvmGrammars, type JvmGrammar } from '../test-support/parse-jvm.mts';
import { switchLabelFixes } from './switch-labels.mts';

const grammars: { java?: JvmGrammar; kotlin?: JvmGrammar } = {};

beforeAll(async () => {
  Object.assign(grammars, await jvmGrammars());
});

function merged(lines: readonly string[], file = 'src/main/java/shop/Rules.java') {
  const text = `${lines.join('\n')}\n`;
  const grammar = file.endsWith('.kt') ? grammars.kotlin : grammars.java;
  if (grammar === undefined) {
    throw new Error('grammars are not loaded');
  }
  const fixes = switchLabelFixes(grammar, { file, text });
  const edits = fixes.flatMap(({ edits: list }) => list).toSorted((a, b) => b.start - a.start);
  const after = edits.reduce(
    (result, edit) => `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`,
    text,
  );
  return { lines: fixes.map(({ finding }) => finding.line), after: after.split('\n').slice(0, -1) };
}

const JAVA_START = ['class Rules {', '  String name(int n) {', '    switch (n) {'];
const JAVA_END = ['      default:', '        return "other";', '    }', '  }', '}'];

describe('switchLabelFixes on Java colon cases', () => {
  it('stacks the labels of cases with the same body on the first case', () => {
    const cases = [
      '      case 1:',
      '        return "low";',
      '      case 2:',
      '        return "mid";',
    ];
    const same = ['      case 3:', '        return "low";'];

    expect(merged([...JAVA_START, ...cases, ...same, ...JAVA_END])).toEqual({
      lines: [8],
      after: [
        ...JAVA_START,
        '      case 1: case 3:',
        '        return "low";',
        '      case 2:',
        '        return "mid";',
        ...JAVA_END,
      ],
    });
  });

  it('keeps cases that fall through, or that a falling case enters', () => {
    const cases = [
      '      case 1:',
      '        count++;',
      '      case 2:',
      '        return "low";',
      '      case 3:',
      '        return "low";',
    ];
    const text = [...JAVA_START, ...cases, ...JAVA_END];

    expect(merged(text)).toEqual({ lines: [], after: text });
  });

  it('keeps a case that declares a local the next cases may use', () => {
    const cases = [
      '      case 1:',
      '        return "low";',
      '      case 2:',
      '        int unused = 0;',
      '        return "low";',
    ];
    const text = [...JAVA_START, ...cases, ...JAVA_END];

    expect(merged(text).lines).toEqual([]);
  });

  it('keeps cases with a comment', () => {
    const cases = [
      '      case 1:',
      '        return "low";',
      '      case 2: // legacy',
      '        return "low";',
    ];
    const text = [...JAVA_START, ...cases, ...JAVA_END];

    expect(merged(text).lines).toEqual([]);
  });
});

describe('switchLabelFixes on Java arrow cases', () => {
  it('keeps cases whose strings differ only in spaces', () => {
    const text = [
      'class Rules {',
      '  String name(int n) {',
      '    return switch (n) {',
      '      case 1 -> "a b";',
      '      case 2 -> "ab";',
      "      case 3 -> ' ';",
      '      default -> "other";',
      '    };',
      '  }',
      '}',
    ];

    expect(merged(text).lines).toEqual([]);
  });

  it('merges cases that differ only in the spacing of their code', () => {
    const text = [
      'class Rules {',
      '  int pick(int n) {',
      '    return switch (n) {',
      '      case 1 -> n+1;',
      '      case 2 -> n + 1;',
      '      default -> 0;',
      '    };',
      '  }',
      '}',
    ];

    expect(merged(text).lines).toEqual([5]);
  });

  it('adds the labels to the first case and removes the others', () => {
    const text = [
      'class Rules {',
      '  String name(int n) {',
      '    return switch (n) {',
      '      case 1, 4 -> "low";',
      '      case 2 -> "mid";',
      '      case 3 -> "low";',
      '      default -> "other";',
      '    };',
      '  }',
      '}',
    ];

    expect(merged(text).after).toEqual([
      'class Rules {',
      '  String name(int n) {',
      '    return switch (n) {',
      '      case 1, 4, 3 -> "low";',
      '      case 2 -> "mid";',
      '      default -> "other";',
      '    };',
      '  }',
      '}',
    ]);
  });

  it('keeps pattern labels, guards and the default case', () => {
    const text = [
      'class Rules {',
      '  String name(Object o) {',
      '    return switch (o) {',
      '      case Integer i when i > 3 -> "big";',
      '      case Long l -> "big";',
      '      default -> "big";',
      '    };',
      '  }',
      '}',
    ];

    expect(merged(text).lines).toEqual([]);
  });

  it('merges only the inner switch that no other merge removes', () => {
    const inner =
      'switch (m) { case 1 -> { return 1; } case 2 -> { return 1; } default -> { return 0; } }';
    const text = [
      'class Rules {',
      '  int pick(int n, int m) {',
      '    switch (n) {',
      `      case 1 -> { ${inner} }`,
      `      case 2 -> { ${inner} }`,
      '      default -> { return 2; }',
      '    }',
      '  }',
      '}',
    ];

    expect(merged(text).lines).toEqual([4]);
  });
});

describe('switchLabelFixes on Kotlin when', () => {
  it('merges adjacent entries with the same body', () => {
    const text = [
      'fun name(n: Int) = when (n) {',
      '    1 -> "low"',
      '    2 -> "low"',
      '    3 -> "mid"',
      '    else -> "other"',
      '}',
    ];

    expect(merged(text, 'src/main/kotlin/shop/Rules.kt').after).toEqual([
      'fun name(n: Int) = when (n) {',
      '    1, 2 -> "low"',
      '    3 -> "mid"',
      '    else -> "other"',
      '}',
    ]);
  });

  it('keeps entries apart when another entry sits between them, or a type test smart casts', () => {
    const text = [
      'fun name(n: Any) = when (n) {',
      '    in 1..3 -> "low"',
      '    2 -> "mid"',
      '    in 4..5 -> "low"',
      '    is String -> n.length',
      '    is List<*> -> n.length',
      '    else -> "other"',
      '}',
    ];

    expect(merged(text, 'src/main/kotlin/shop/Rules.kt').lines).toEqual([]);
  });

  it('keeps a when without a subject', () => {
    const text = [
      'fun name(n: Int) = when {',
      '    n < 0 -> "x"',
      '    n > 9 -> "x"',
      '    else -> "y"',
      '}',
    ];

    expect(merged(text, 'src/main/kotlin/shop/Rules.kt').lines).toEqual([]);
  });
});
