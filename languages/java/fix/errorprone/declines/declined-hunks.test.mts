import { describe, expect, it } from 'vitest';
import { isDeclined } from './declined-hunks.mts';

function entry(label: string, removed: readonly string[], added: readonly string[] = []) {
  return {
    label,
    hunk: {
      oldStart: 1,
      oldCount: removed.length,
      newStart: 1,
      newCount: added.length,
      lines: [
        ...removed.map((text) => ({ kind: '-', text })),
        ...added.map((text) => ({ kind: '+', text })),
      ],
    },
  };
}

function quotedNames(names: readonly string[], extended: readonly string[] = []) {
  return {
    quoted: (name: string) => names.includes(name),
    extended: (name: string) => extended.includes(name),
  };
}

describe('isDeclined', () => {
  it('keeps the removal of a private method that no string names', () => {
    const removal = entry('UnusedMethod', [
      '  private static String hidden() {',
      '    return "x";',
      '  }',
    ]);

    expect(isDeclined(removal, quotedNames([]))).toBe(false);
  });

  it('declines the removal of a private method that a string names, as reflection does', () => {
    const removal = entry('UnusedMethod', [
      '  private static String hidden() {',
      '    return "x";',
      '  }',
    ]);

    expect(isDeclined(removal, quotedNames(['hidden']))).toBe(true);
  });

  it('declines the removal of a nested class that a string names', () => {
    const removal = entry('UnusedNestedClass', ['  private static final class Plugin {', '  }']);

    expect(isDeclined(removal, quotedNames(['Plugin']))).toBe(true);
  });

  it('declines unpacking an array of one element, which may be null or an array itself', () => {
    const unpack = entry(
      'ExplicitArrayForVarargs',
      ['    return count(new Object[] {inner});'],
      ['    return count(inner);'],
    );

    expect(isDeclined(unpack, quotedNames([]))).toBe(true);
  });

  it.each([
    [['    return count(new Object[] {', '        inner', '    });']],
    [['    return count(new Object[] {new Object[] {a, b}});']],
    [['    return count(new Object[] {inner,});']],
    [['    return count(new String[] {"a,b"});']],
  ])('declines an array of one element written as %j', (removed) => {
    expect(isDeclined(entry('ExplicitArrayForVarargs', removed), quotedNames([]))).toBe(true);
  });

  it('keeps unpacking an array of several elements', () => {
    const unpack = entry(
      'ExplicitArrayForVarargs',
      ['    return String.format("%s-%s", new Object[] {"p", f(a, b)});'],
      ['    return String.format("%s-%s", "p", f(a, b));'],
    );

    expect(isDeclined(unpack, quotedNames([]))).toBe(false);
  });

  it('declines making a field final when a string names it, as reflective injection does', () => {
    const field = entry(
      'FieldCanBeFinal',
      ['  private int injected = 1;'],
      ['  private final int injected = 1;'],
    );

    expect(isDeclined(field, quotedNames(['injected']))).toBe(true);
    expect(isDeclined(field, quotedNames([]))).toBe(false);
  });

  it('declines a private constructor for a class that another class extends', () => {
    const constructor = entry('PrivateConstructorForUtilityClass', [], ['  private Helpers() {}']);

    expect(isDeclined(constructor, quotedNames([], ['Helpers']))).toBe(true);
    expect(isDeclined(constructor, quotedNames([]))).toBe(false);
  });

  it('keeps the removal when only a call inside the removed body is a quoted name', () => {
    const removal = entry('UnusedMethod', [
      '  @SuppressWarnings("x") private static <T> List<T> hidden(T value) {',
      '    return format(value);',
      '  }',
    ]);

    expect(isDeclined(removal, quotedNames(['format']))).toBe(false);
    expect(isDeclined(removal, quotedNames(['hidden']))).toBe(true);
  });

  it('keeps the hunks of other checks', () => {
    expect(isDeclined(entry('UnusedLabel', ['    outer:']), quotedNames(['outer']))).toBe(false);
  });
});
