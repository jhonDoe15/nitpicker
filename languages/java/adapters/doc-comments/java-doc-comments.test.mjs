import { describe, expect, it } from 'vitest';
import { javaDocComments } from './java-doc-comments.mjs';

function declared(source) {
  return javaDocComments(source).map(({ line, qualifier }) => [line, qualifier]);
}

const ORDERS = [
  'package shop;',
  '',
  '/** Keeps the open orders. */',
  '@Entity',
  'public final class Orders<T extends Order> implements Iterable<T> {',
  '  /** Cents. */',
  '  private static final int TOTAL = 0, OTHER = 1;',
  '  /** Built empty. */',
  '  public Orders() {}',
  '  /** Sums. */',
  '  @Override',
  '  public <R> Map<String, R> total(final @Named("a") Map<String, Integer> byId, int... rest) {',
  '    /** Not a member. */',
  '    int local = 1;',
  '    return null;',
  '  }',
  '  /** Sums one. */',
  '  int total(long id) { return 0; }',
  '  /** States. */',
  '  enum State {',
  '    /** Open. */',
  '    OPEN("o"),',
  '    /** Closed. */',
  '    CLOSED { @Override String code() { return "c"; } };',
  '    /** Coded. */',
  '    State(String code) {}',
  '    /** The code. */',
  '    String code() { return ""; }',
  '  }',
  '  /** A point. */',
  '  record Point(int x, int y) {',
  '    /** Checked. */',
  '    Point {}',
  '  }',
  '  /** Marks. */',
  '  @interface Marker { /** The name. */ String value() default ""; }',
  '}',
].join('\n');

describe('javaDocComments', () => {
  it('names each documented declaration with its enclosing types and parameter types', () => {
    expect(declared(ORDERS)).toEqual([
      [3, 'Orders'],
      [6, 'Orders.TOTAL'],
      [8, 'Orders.Orders()'],
      [10, 'Orders.total(Map<String,Integer>,int...)'],
      [17, 'Orders.total(long)'],
      [19, 'Orders.State'],
      [21, 'Orders.State.OPEN'],
      [23, 'Orders.State.CLOSED'],
      [25, 'Orders.State.State(String)'],
      [27, 'Orders.State.code()'],
      [30, 'Orders.Point'],
      [32, 'Orders.Point.Point'],
      [35, 'Orders.Marker'],
      [36, 'Orders.Marker.value()'],
    ]);
  });

  it.each([
    ['a package comment', '/** The shop. */\npackage shop;\n'],
    ['a statement in a body', 'class A {\n  void a() {\n    /** Call. */\n    run();\n  }\n}\n'],
    ['a comment that ends the file', 'class A {}\n/** Trailing. */\n'],
    [
      'a member of an anonymous class',
      'class A {\n  Runnable r = new Runnable() {\n    /** Runs. */\n    public void run() {}\n  };\n}\n',
    ],
    [
      'a doc comment inside a string',
      'class A {\n  String s = "/** Not one. */";\n  String t = """\n    /** Nor this. */\n    """;\n}\n',
    ],
    ['an empty block comment', 'class A {\n  /**/\n  int a;\n}\n'],
    [
      'a return in a body',
      'class A {\n  int a() {\n    /** The value. */\n    return 1;\n  }\n}\n',
    ],
  ])('skips %s', (_case, source) => {
    expect(declared(source)).toEqual([]);
  });

  it('keeps the description apart from the tags, and says when a tag has text', () => {
    const source = [
      'class A {',
      '  /**',
      '   * Gets the user name.',
      '   *',
      '   * @param id the account, never null',
      '   * @return the name',
      '   */',
      '  String getUserName(String id) { return id; }',
      '  /** Gets the user name. @deprecated */',
      '  String getUser() { return ""; }',
      '  /**',
      '   * Gets the user.',
      '   * @param id',
      '   * @throws IOException',
      '   */',
      '  String getUserById(String id) { return id; }',
      '}',
    ].join('\n');

    expect(javaDocComments(source).map(({ lines, detailed }) => [lines, detailed])).toEqual([
      [['Gets the user name.'], true],
      [['Gets the user name. @deprecated'], false],
      [['Gets the user.'], false],
    ]);
  });

  it('reads <pre> blocks as code and drops HTML markup and entities', () => {
    const source = [
      'class A {',
      '  /**',
      '   * Sums the <b>open</b> rows.',
      '   * <p>',
      '   * <pre>{@code',
      '   * @Override',
      '   * int sum() { return 1; }',
      '   * }</pre>',
      '   * Rounds &amp; caps.',
      '   * <pre>one()</pre>',
      '   */',
      '  int sum() { return 1; }',
      '}',
    ].join('\n');

    expect(javaDocComments(source)[0].lines).toEqual([
      'Sums the  open  rows.',
      '```',
      '@Override',
      'int sum() { return 1; }',
      '```',
      'Rounds   caps.',
    ]);
  });

  it('reads a Markdown doc comment of /// lines, but not a //// banner', () => {
    const source = [
      'class A {',
      '  /// Sums the rows.',
      '  ///',
      '  /// ```',
      '  /// sum();',
      '  /// ```',
      '  int sum() { return 1; }',
      '  //// Section',
      '  int count() { return 1; }',
      '}',
    ].join('\n');

    expect(javaDocComments(source)).toEqual([
      {
        line: 2,
        name: 'sum',
        qualifier: 'A.sum()',
        lines: ['Sums the rows.', '```', 'sum();', '```'],
        detailed: false,
      },
    ]);
  });
});
