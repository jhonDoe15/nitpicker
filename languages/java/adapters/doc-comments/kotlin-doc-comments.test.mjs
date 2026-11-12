import { describe, expect, it } from 'vitest';
import { kotlinDocComments } from './kotlin-doc-comments.mjs';

function declared(source) {
  return kotlinDocComments(source).map(({ line, qualifier }) => [line, qualifier]);
}

const ORDERS = [
  'package shop',
  '',
  '/** Keeps the open orders. */',
  '@Serializable',
  'data class Orders<T : Order>(',
  '  /** Never blank. */',
  '  @get:JsonProperty("id") val id: String,',
  ') : Iterable<T> {',
  '  /** Cents. */',
  '  val total by lazy { 0 }',
  '  /** Sums. */',
  '  override fun <R> List<R>.sum(byId: Map<String, Int>, then: (Int) -> Unit = {}): Int = 1',
  '  /** Built from a count. */',
  '  constructor(count: Int) : this("")',
  '  /** Factories. */',
  '  companion object {',
  '    /** One. */',
  '    @JvmStatic fun of(id: String) = Orders<Order>(id)',
  '  }',
  '  fun local() {',
  '    /** Not a member. */',
  '    val x = 1',
  '  }',
  '}',
  '/** States. */',
  'enum class State(val code: String) {',
  '  /** Open. */',
  '  OPEN("o"),',
  '  /** Closed. */',
  '  CLOSED("c");',
  '  /** Starts. */',
  '  init {}',
  '}',
  '/** Maps. */',
  'fun interface Mapper { fun map(): Int }',
  '/** The ids. */',
  'typealias Ids = List<String>',
  '/** Shared. */',
  'object Registry',
  '/** Named. */',
  'class Holder { companion object Factory }',
  '/** `Quoted`. */',
  'fun `quoted name`(): Int = 1',
].join('\n');

describe('kotlinDocComments', () => {
  it('names each documented declaration with its enclosing types and parameter types', () => {
    expect(declared(ORDERS)).toEqual([
      [3, 'Orders'],
      [6, 'Orders.id'],
      [9, 'Orders.total'],
      [11, 'Orders.List<R>.sum(Map<String,Int>,(Int)->Unit)'],
      [13, 'Orders.Orders(Int)'],
      [15, 'Orders.Companion'],
      [17, 'Orders.Companion.of(String)'],
      [25, 'State'],
      [27, 'State.OPEN'],
      [29, 'State.CLOSED'],
      [34, 'Mapper'],
      [36, 'Ids'],
      [38, 'Registry'],
      [40, 'Holder'],
      [42, 'quoted name()'],
    ]);
  });

  it.each([
    ['a file comment', '/** The shop. */\npackage shop\n'],
    ['a statement in a body', 'fun a() {\n  /** Call. */\n  run()\n}\n'],
    ['a comment that ends the file', 'class A\n/** Trailing. */\n'],
    [
      'a member of an anonymous object',
      'val r = object : Runnable {\n  /** Runs. */\n  override fun run() {}\n}\n',
    ],
    [
      'a doc comment inside a string',
      'val s = "/** Not one. */"\nval t = """\n/** Nor this. */\n"""\n',
    ],
    ['a destructuring declaration', 'class A {\n  /** Both. */\n  val (a, b) = 1 to 2\n}\n'],
  ])('skips %s', (_case, source) => {
    expect(declared(source)).toEqual([]);
  });

  it('keeps the description apart from the tags, and says when a tag has text', () => {
    const source = [
      '/**',
      ' * Gets the user name.',
      ' *',
      ' * @param id the account, never blank',
      ' */',
      'fun getUserName(id: String) = id',
      '/**',
      ' * Gets the user.',
      ' * ```',
      ' * @Test fun x() {}',
      ' * ```',
      ' * @param id',
      ' * @return',
      ' */',
      'fun getUser(id: String) = id',
    ].join('\n');

    expect(kotlinDocComments(source).map(({ lines, detailed }) => [lines, detailed])).toEqual([
      [['Gets the user name.'], true],
      [['Gets the user.', '```', '@Test fun x() {}', '```'], false],
    ]);
  });

  it('names a class without a body and the declaration after it', () => {
    const source = [
      '/** A pair. */',
      'class Pair(val a: Int, val b: Int)',
      '',
      '/** Sums. */',
      'fun Pair.sum() = a + b',
    ].join('\n');

    expect(declared(source)).toEqual([
      [1, 'Pair'],
      [4, 'Pair.sum()'],
    ]);
  });

  it('keeps extension overloads apart by their receiver', () => {
    const source = [
      '/** To x. */',
      'fun String.toX() = 1',
      '/** To x. */',
      'fun Int.toX() = 2',
      '/** Named. */',
      'val Int?.named: String get() = ""',
    ].join('\n');

    expect(declared(source)).toEqual([
      [1, 'String.toX()'],
      [3, 'Int.toX()'],
      [5, 'Int?.named'],
    ]);
  });

  it('finds the body of a class whose supertype sits in a package named like a modifier', () => {
    const source = 'class A : com.app.data.Repo, inline.B {\n  /** Foo. */\n  fun foo() {}\n}\n';

    expect(declared(source)).toEqual([[2, 'A.foo()']]);
  });

  it('reads a bracketed tag as a tag', () => {
    const source = [
      '/**',
      ' * Sums.',
      ' * @param[a] the first',
      ' * @param[b] the second',
      ' * @param[c] the third',
      ' * @param[d] the fourth',
      ' * @param[e] the fifth',
      ' */',
      'fun sum(a: Int, b: Int, c: Int, d: Int, e: Int) = a',
    ].join('\n');

    expect(kotlinDocComments(source).map(({ lines, detailed }) => [lines, detailed])).toEqual([
      [['Sums.'], true],
    ]);
  });
});
