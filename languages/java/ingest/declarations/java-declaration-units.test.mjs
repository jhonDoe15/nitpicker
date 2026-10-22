import { describe, expect, it } from 'vitest';
import { javaDeclarationUnits } from './java-declaration-units.mjs';

const unitsOf = (source) =>
  javaDeclarationUnits('src/A.java', source).map(({ name, start, end }) => [name, start, end]);

describe('javaDeclarationUnits', () => {
  it('finds the field initializers of a class, a lambda one included', () => {
    expect(
      unitsOf(
        [
          'package demo;',
          'public class Fields {',
          '  private int plain;',
          '  private final String mode = flag ? "a" : "b";',
          '  private final Runnable task = () -> {',
          '    if (flag) { run(); }',
          '  };',
          '  int[] table = { 1, 2 };',
          '  public void method() { int local = flag ? 1 : 2; }',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      ['Fields.mode', 4, 4],
      ['Fields.task', 5, 7],
      ['Fields.table', 8, 8],
    ]);
  });

  it('finds static and instance initializer blocks', () => {
    expect(
      unitsOf(
        [
          'class A {',
          '  static {',
          '    x = flag ? 1 : 2;',
          '  }',
          '  {',
          '    y = 1;',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      ['A.<clinit>', 2, 4],
      ['A.<init>', 5, 7],
    ]);
  });

  it('qualifies the units of nested classes, interfaces, enums and records', () => {
    expect(
      unitsOf(
        [
          'class Outer {',
          '  static class Inner { int a = f() ? 1 : 2; }',
          '  interface Api { int LIMIT = flag ? 1 : 2; }',
          '  enum Kind { ONE, TWO(2) { int g() { return 1; } }; int size = ok ? 1 : 2; }',
          '  record Point(int x) { static int origin = ok ? 1 : 2; }',
          '  int own = 1;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      ['Outer.Inner.a', 2, 2],
      ['Outer.Api.LIMIT', 3, 3],
      ['Outer.Kind.size', 4, 4],
      ['Outer.Point.origin', 5, 5],
      ['Outer.own', 6, 6],
    ]);
  });

  it('ignores comments, strings and annotations with assignments', () => {
    expect(
      unitsOf(
        [
          'class A {',
          '  // int hidden = 1;',
          '  /* int gone = 2; */',
          '  @Named(value = "x") String label;',
          '  String text = "a = b; {";',
          "  char brace = '{';",
          '  void method() { if (a == b) { return; } }',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      ['A.text', 5, 5],
      ['A.brace', 6, 6],
    ]);
  });

  it('returns no unit for a file with only methods', () => {
    expect(unitsOf('class A { void m() { int x = 1; } }')).toEqual([]);
  });
});
