import { describe, expect, it } from 'vitest';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { ROUND_TRIP_RULE, roundTripFindings } from './round-trips.mjs';
import { roundTripMessage } from '../../../../../shared/rules/round-trips/round-trips.mjs';

const JAVA_MAIN = {
  file: 'src/main/java/shop/Codec.java',
  kotlin: false,
  text: `package shop;
public class Codec {
  public String toJson() { return ""; }
  public static Codec fromJson(String text) { return new Codec(); }
  public static String encode(int value) { return ""; }
  public static int decode(String text) { return 1; }
  String pack() { return ""; }
  public String unpack() { return ""; }
}
interface Format { String serialize(); Object deserialize(String text); }
`,
};
const KOTLIN_MAIN = {
  file: 'src/main/kotlin/shop/Order.kt',
  kotlin: true,
  text: `package shop
class Order(val id: Int) {
  fun toJson(): String = "x"
  companion object { fun fromJson(text: String): Order = Order(1) }
}
fun encodeOrder(order: Order): String { return "" }
fun decodeOrder(text: String): Order = Order(1)
private fun dumpOrder(order: Order) = ""
fun loadOrder(text: String) = Order(1)
`,
};

function summary(main, tests) {
  return roundTripFindings(main, () => tests).map(
    ({ rule, path, location, symbol }) => `${rule} ${path}:${String(location.line)} ${symbol}`,
  );
}

describe('roundTripFindings', () => {
  it('reports each public pair of a class or file that no test calls on both sides', () => {
    const tests = [
      {
        kotlin: false,
        text: `package shop;
class CodecTest {
  @Test void encodes() { assertEquals("1", Codec.encode(1)); }
  @Test void decodes() { assertEquals(1, Codec.decode("1")); }
}
`,
      },
    ];

    expect(summary([JAVA_MAIN, KOTLIN_MAIN], tests)).toEqual([
      `${ROUND_TRIP_RULE} src/main/java/shop/Codec.java:4 Codec.fromJson`,
      `${ROUND_TRIP_RULE} src/main/java/shop/Codec.java:6 Codec.decode`,
      `${ROUND_TRIP_RULE} src/main/kotlin/shop/Order.kt:7 decodeOrder`,
      `${ROUND_TRIP_RULE} src/main/kotlin/shop/Order.kt:4 Order.fromJson`,
    ]);
  });

  it('names both halves, the allowed form and the exception route', () => {
    const [found] = roundTripFindings([JAVA_MAIN], () => []);

    expect(found.message).toBe(
      findingFactory()({
        rule: ROUND_TRIP_RULE,
        file: JAVA_MAIN.file,
        line: 1,
        message: roundTripMessage({
          first: 'Codec.toJson',
          second: 'Codec.fromJson',
          example: 'assertEquals(value, Codec.fromJson(value.toJson()))',
        }),
      }).message,
    );
  });

  it('accepts a JUnit, nested or Kotest test that calls both, also through a helper', () => {
    const tests = [
      {
        kotlin: false,
        text: `package shop;
class CodecTest {
  @Nested class Json {
    @ParameterizedTest void roundTrips(Codec codec) { assertEquals(codec, Codec.fromJson(codec.toJson())); }
  }
  @Test void tokens() { assertEquals(1, trip(1)); }
  private int trip(int value) { return Codec.decode(Codec.encode(value)); }
}
`,
      },
      {
        kotlin: true,
        text: `package shop
class OrderSpec : StringSpec({
  "orders" { decodeOrder(encodeOrder(Order(1))) shouldBe Order(1) }
})
class OrderTest {
  @Test fun json() { assertEquals(1, Order.fromJson(Order(1).toJson()).id) }
}
`,
      },
    ];

    expect(summary([JAVA_MAIN, KOTLIN_MAIN], tests)).toEqual([]);
  });

  it('reads no tests when the main sources hold no pair', () => {
    const main = [
      { file: 'src/main/java/A.java', kotlin: false, text: 'class A { void run() {} }' },
    ];

    expect(
      roundTripFindings(main, () => {
        throw new Error('read');
      }),
    ).toEqual([]);
  });

  it('scans nested types, skips toString and fromString and sees JUnit 3 and qualified tests', () => {
    const main = {
      file: 'src/main/java/shop/Money.java',
      kotlin: false,
      text: `package shop;
public class Money {
  public String toString() { return ""; }
  public static Money fromString(String text) { return new Money(); }
  public static class Wire {
    public static String marshal(Money money) { return ""; }
    public static Money unmarshal(String text) { return new Money(); }
  }
  public static class Token {
    public static String escape(String text) { return text; }
    public static String unescape(String text) { return text; }
  }
}
`,
    };
    const tests = [
      {
        kotlin: false,
        text: `package shop;
public class MoneyTest extends TestCase {
  public void testWire() { check(new Money()); }
  private void check(Money money) { assertEquals(money, trip(money)); }
  private Money trip(Money money) { return Money.Wire.unmarshal(Money.Wire.marshal(money)); }
}
`,
      },
    ];

    expect(summary([main], tests)).toEqual([
      `${ROUND_TRIP_RULE} src/main/java/shop/Money.java:11 Money.Token.unescape`,
    ]);
    expect(
      summary(
        [main],
        [
          {
            kotlin: false,
            text: `class TokenTest {
  @org.junit.jupiter.api.Test void tokens() { Money.Token.unescape(Money.Token.escape("a")); }
}
`,
          },
        ],
      ),
    ).toEqual([`${ROUND_TRIP_RULE} src/main/java/shop/Money.java:7 Money.Wire.unmarshal`]);
  });
});
