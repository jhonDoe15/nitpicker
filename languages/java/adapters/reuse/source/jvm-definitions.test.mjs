import { describe, expect, it } from 'vitest';
import { readJvmDefinitions } from './jvm-definitions.mjs';
import { tokenizeJvm } from './jvm-tokens.mjs';

function summary(source, kotlin = false) {
  return readJvmDefinitions(source, { kotlin }).definitions.map(
    ({ kind, name, qualifier, line, exported, literal, entry }) =>
      [
        kind,
        qualifier ?? name,
        `line ${String(line)}`,
        exported ? 'exported' : 'private',
        ...(literal === undefined ? [] : [literal ? 'literal' : 'computed']),
        ...(entry ? ['entry'] : []),
      ].join(' '),
  );
}

const JAVA = `package shop.money;

import java.util.Map;
import static shop.util.Strings.trim;
import shop.util.*;

@Deprecated
public final class Money {
  public static final String CURRENCY = "EUR";
  private static final int SCALE = 2 + 1;
  private static final Runnable LOG = () -> { System.out.println(); };
  private final long cents;
  static { System.out.println("loaded"); }
  public Money(long cents) { this.cents = cents; }
  public static Money of(@Size(max = 3) final long cents) { return new Money(cents); }
  public static Money of(int cents) { return new Money(cents); }
  private static String format(Map<String, Integer> totals) { return totals + CURRENCY; }
  public long cents() { return cents; }
  public static void main(String[] args) {}
}

interface Pricing { int LIMIT = 5; static int twice(int x) { return x * 2; } int price(); }
enum Color { RED; static Color parse(String s) { return RED; } }
record Point(int x, int y) { static Point origin() { return new Point(0, 0); } }
@interface Marker {}
`;

const KOTLIN = `@file:JvmName("Util")
package shop.util

import shop.money.Money as Cash
import shop.money.*

const val GREETING = "hi"
val TIMEOUT: Int = 30
private val logger = mu.KotlinLogging.logger {}
val banner = "\${GREETING}!"

@JvmStatic
fun <T> List<T>.second(): T = this[1]

fun trim(s: String) =
    s.trim()

fun trim(s: String, n: Int = 1): String {
    return s.trim()
}

data class Pair2(val a: Int, val b: Int)

object Registry {
    const val MAX = 3
    fun lookup(name: String): String? = null
}

class Shop(val name: String) {
    fun instance() = 1
    companion object Factory {
        fun create(): Shop = Shop("x")
        @JvmStatic fun main(args: Array<String>) {}
    }
}

enum class Kind { A, B }
typealias Names = List<String>
fun interface Action { fun run() }
annotation class Tag
`;

describe('readJvmDefinitions', () => {
  it('reads the package and imports of a Java file', () => {
    const { packageName, imports } = readJvmDefinitions(JAVA);

    expect({ packageName, imports }).toEqual({
      packageName: 'shop.money',
      imports: [
        { path: 'java.util.Map', wildcard: false, static: false },
        { path: 'shop.util.Strings.trim', wildcard: false, static: true },
        { path: 'shop.util', wildcard: true, static: false },
      ],
    });
  });

  it('lists top-level Java types with their static methods and constants, not instance members', () => {
    expect(summary(JAVA)).toEqual([
      'class Money line 7 exported entry',
      'const Money.CURRENCY line 9 exported literal',
      'const Money.SCALE line 10 private literal',
      'const Money.LOG line 11 private computed',
      'function Money.of(long) line 15 exported',
      'function Money.of(int) line 16 exported',
      'function Money.format line 17 private',
      'function Money.main line 19 exported entry',
      'interface Pricing line 22 exported',
      'const Pricing.LIMIT line 22 exported literal',
      'function Pricing.twice line 22 exported',
      'enum Color line 23 exported',
      'class Point line 24 exported',
      'function Point.origin line 24 exported',
      'type Marker line 25 exported',
    ]);
  });

  it('lists Kotlin top-level declarations and the members of objects and companion objects', () => {
    expect(summary(KOTLIN, true)).toEqual([
      'const GREETING line 7 exported literal',
      'const TIMEOUT line 8 exported literal',
      'const logger line 9 private computed',
      'const banner line 10 exported computed',
      'function second line 12 exported',
      'function trim(String) line 15 exported',
      'function trim(String,Int) line 18 exported',
      'class Pair2 line 22 exported',
      'class Registry line 24 exported',
      'const Registry.MAX line 25 exported literal',
      'function Registry.lookup line 26 exported',
      'class Shop line 29 exported entry',
      'function Shop.create line 32 exported',
      'function Shop.main line 33 exported entry',
      'enum Kind line 37 exported',
      'type Names line 38 exported',
      'interface Action line 39 exported',
      'type Tag line 40 exported',
    ]);
  });

  it('gives a static member the name other files use for it and keeps its whole text', () => {
    const [, currency] = readJvmDefinitions(JAVA).definitions;

    expect(currency).toMatchObject({
      exportNames: ['Money.CURRENCY'],
      tokens: ['public', 'static', 'final', 'String', 'CURRENCY', '=', '"EUR"', ';'],
      usedLocally: true,
    });
  });

  it('marks functions as overloads, and counts a Kotlin string template as a local use', () => {
    const definitions = readJvmDefinitions(KOTLIN, { kotlin: true }).definitions;
    const byName = new Map(definitions.map((definition) => [definition.name, definition]));

    expect([
      byName.get('GREETING').usedLocally,
      byName.get('TIMEOUT').usedLocally,
      byName.get('second').overloads,
      byName.get('GREETING').overloads,
    ]).toEqual([true, false, true, undefined]);
  });
});

describe('tokenizeJvm', () => {
  it('keeps each string, text block and character literal as one token and drops comments', () => {
    const source = 'a = """\n  x " y\n""" + "q\\"r" + \'"\' /* c */ // d\n+ 1_000L';

    expect(tokenizeJvm(source).map(({ text }) => text)).toEqual([
      'a',
      '=',
      '"""\n  x " y\n"""',
      '+',
      '"q\\"r"',
      '+',
      "'\"'",
      '+',
      '1_000L',
    ]);
  });

  it('reads Kotlin nested comments and templates that hold quotes and braces', () => {
    const source = '/* a /* b */ c */ val s = "${ "}" + x } $y" + 1..2';

    expect(tokenizeJvm(source, { kotlin: true }).map(({ text }) => text)).toEqual([
      'val',
      's',
      '=',
      '"${ "}" + x } $y"',
      '+',
      '1',
      '..',
      '2',
    ]);
  });

  it('ends a Java block comment at the first close and leaves a dollar brace in a Java string alone', () => {
    const source = '/* a /* b */ int x = "${";\nint y;';

    expect(tokenizeJvm(source).map(({ text }) => text)).toEqual([
      'int',
      'x',
      '=',
      '"${"',
      ';',
      'int',
      'y',
      ';',
    ]);
  });
});
