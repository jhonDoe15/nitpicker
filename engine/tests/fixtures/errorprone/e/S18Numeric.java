import com.google.common.hash.HashCode;
import com.google.common.hash.Hashing;
import java.lang.invoke.MethodHandle;
import java.util.Random;
import java.util.UUID;

class S18Numeric {
  static final long L = 42;
  static final MethodHandle MH = null;
  static final Random RANDOM = new Random();
  int field;

  S18Numeric(float f) {}

  S18Numeric(long l, boolean b) {
    this((float) 0, l);
  }

  S18Numeric(float f, long l) {
    this(l);
  }

  S18Numeric(float f, int i) {}

  S18Numeric(long l, char c) {
    this(l, 1);
  }

  S18Numeric(long l) {
    this((float) l);
  }

  void f(Long l) {}

  void f(float l) {}

  void g(float l, double d) {}

  void h(Object... values) {}

  void longToFloat(long l, int i, Long boxed) {
    f(0L);
    f((float) 0L);
    g(l, l);
    g(l + 1, i);
    g(i, l);
    g(boxed, 1);
    h(l);
    f(l * 2);
    Math.max(1L, 2.0f);
    Math.max(l, 2L);
    String.valueOf(l);
    float local = l;
    long result;
    try {
      result = (long) MH.invoke(null, L);
    } catch (Throwable throwable) {
    }
  }

  @SuppressWarnings("LongFloatConversion")
  void suppressedLongToFloat(long l) {
    f(l);
  }

  void abs(String s, Object o, UUID uuid, HashCode hash, long l, int i, float fl, double d) {
    Math.abs(RANDOM.nextInt());
    Math.abs(RANDOM.nextLong());
    Math.abs(RANDOM.nextInt(10));
    Math.abs(-9549451);
    Math.abs(Math.sin(0) * 10.0);
    Math.abs(new Random().nextDouble());
    Math.abs(Hashing.goodFastHash(64).hashUnencodedChars("").asInt());
    Math.abs(Hashing.goodFastHash(64).hashUnencodedChars("").asLong());
    Math.abs(Hashing.goodFastHash(64).hashUnencodedChars("").padToLong());
    Math.abs(hash.asInt());
    Math.abs(s.hashCode());
    Math.abs(hashCode());
    Math.abs(System.identityHashCode(o));
    Math.abs(uuid.getLeastSignificantBits());
    Math.abs(uuid.getMostSignificantBits());
    Math.abs(com.google.common.primitives.Longs.hashCode(l));
    Math.abs(com.google.common.primitives.Ints.hashCode(i));
    Math.abs(com.google.common.primitives.Floats.hashCode(fl));
    Math.abs(com.google.common.primitives.Doubles.hashCode(d));
    Math.abs(Long.hashCode(l));
    Math.abs(Integer.hashCode(i));
    Math.abs(Float.hashCode(fl));
    Math.abs(Double.hashCode(d));
    Math.abs((s.hashCode()));
    Math.abs(i);
    Math.abs(s.length());
    Math.abs(RANDOM.nextDouble());
    Math.abs(Math.floorMod(s.hashCode(), 3));
    Math.max(Math.abs(s.hashCode()), 3);
  }

  @SuppressWarnings("MathAbsoluteNegative")
  int absSuppressed(String s) {
    return Math.abs(s.hashCode());
  }

  static void twoArgs(int a, int b) {}

  static void threeArgs(int a, int b, int c) {}

  static void oneArg(int a) {}

  void unary(int a, int b, int[] xs, S18Numeric other) {
    twoArgs(a++, a--);
    twoArgs(a--, ++a);
    twoArgs(++a, a++);
    twoArgs(--a, --a);
    threeArgs(a++, b++, b++);
    threeArgs(a++, b, a++);
    threeArgs(++a, b++, --b);
    threeArgs(++a, a++, b);
    threeArgs(++a, a++, a);
    threeArgs(++a, a++, a--);
    twoArgs(a, b);
    twoArgs(a + 1, b);
    twoArgs(a++, b);
    twoArgs(--a, b);
    twoArgs(a, b--);
    twoArgs(a, ++b);
    twoArgs(xs[0]++, xs[0]++);
    twoArgs(this.field++, field++);
    twoArgs(this.field++, other.field++);
    twoArgs((a)++, (a)++);
    twoArgs(a++, a + 1);
    oneArg(a++);
    new S18Numeric(a++, a++ > 0);
  }

  @SuppressWarnings("MultipleUnaryOperatorsInMethodCall")
  void unarySuppressed(int a) {
    twoArgs(a++, a++);
  }

  char x1 = (char) -1;
  char x2 = (char) -2;
  char x3 = (char) -65537;
  char x4 = (char) -1L;
  char x5 = (char) -10000000;
  char x6 = (char) 0;
  char x7 = (char) 1;
  int x8 = (int) -1;
  char x9 = (char) - 1;
  char x10 = (char) 0xFFFFFFFF;
  char x11 = (char) 0xFFFFFFFFFFFFFFFEL;
  char x12 = (char) 0x7FFFFFFF;
  char x13 = (char) -0x1;
  char x14 = (char) (-1);
  char x15 = (char) -65536;
  char x16 = (char) -1_000L;
  char x17 = (char) 037777777777;
  char x18 = (char) 0b11111111111111111111111111111111;
  char x19 = (char) -(1);
  char x20 = (char) -2147483648;
  Character x21 = (Character) (char) -1;
  short x22 = (short) -1;

  @SuppressWarnings("NegativeCharLiteral")
  char x23 = (char) -1;
}
