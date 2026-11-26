package e;

import java.io.IOException;
import java.io.Reader;
import java.util.function.Supplier;

class S13Range {
  private static final int NOT_A_BYTE = 255;

  void byteEquality() {
    boolean result;
    byte b = 0;
    byte[] barr = {1, 2, 3};

    result = b == 255;
    result = b == -255;
    result = b == 128;
    result = b != 255;

    result = barr[0] == 255;
    result = barr[0] == 128;
    result = barr[0] == -255;

    result = b == NOT_A_BYTE;

    Byte boxed = 0;
    result = boxed == 255;
    Supplier<? extends Byte> bSupplier = null;
    result = bSupplier.get() == 255;
    result = 255 == b;
    result = b < 128;
    result = b >= -129;
  }

  void charEquality() throws IOException {
    boolean result;
    char c = 'A';
    Reader reader = null;

    result = c == -1;
    result = c != -1;
    result = c > 65535;
    result = c < 0;
    result = c >= 0;
    result = c <= 70000;

    char d;
    result = (d = (char) reader.read()) == -1;
  }

  void shorts(short s) {
    boolean result;

    result = s == Short.MAX_VALUE + 1;
    result = s == Short.MIN_VALUE - 1;
    result = s != Short.MAX_VALUE + 1;
    result = s != Short.MIN_VALUE - 1;
    result = s > Short.MAX_VALUE;
    result = s > Short.MIN_VALUE - 1;
    result = s >= Short.MAX_VALUE + 1;
    result = s >= Short.MIN_VALUE;
    result = s < Short.MIN_VALUE;
    result = s < Short.MAX_VALUE + 1;
    result = s <= Short.MIN_VALUE - 1;
    result = s <= Short.MAX_VALUE;
  }

  void shortsReversed(short s) {
    boolean result;

    result = Short.MAX_VALUE < s;
    result = Short.MIN_VALUE - 1 < s;
    result = Short.MAX_VALUE + 1 <= s;
    result = Short.MIN_VALUE <= s;
    result = Short.MIN_VALUE > s;
    result = Short.MAX_VALUE + 1 > s;
    result = Short.MIN_VALUE - 1 >= s;
    result = Short.MAX_VALUE >= s;
  }

  void ints(int i, Integer boxed) {
    boolean result;

    result = i == Integer.MAX_VALUE + 1L;
    result = i < Long.MAX_VALUE;
    result = i > Long.MIN_VALUE;
    result = boxed == 3000000000L;
    result = i == 2.5e10;
    result = i > 1e20f;
    result = i < Double.MAX_VALUE;
  }

  void longs(long l) {
    boolean result;

    result = l == Long.MIN_VALUE * 2.0;
    result = l < 1e30;
    result = l > 1e30;
    result = l <= 1e30f;
  }

  @SuppressWarnings("ComparisonOutOfRange")
  void suppressed(byte b) {
    boolean result = b == 255;
  }

  void negative() throws IOException {
    boolean result;
    byte b = 0;
    byte[] barr = {1, 2, 3};

    result = b == 1;
    result = b == -2;
    result = b == 127;
    result = b != 1;
    result = b == (byte) 255;
    result = b == 'a';
    result = b == 1L;
    result = b == 1.123f;
    result = b == 1.123;
    result = barr[0] == 1;
    result = barr[0] == -128;

    char c = 'A';
    Reader reader = null;
    result = c == 0;
    result = c == 0xffff;
    result = c == 1L;
    result = c == 1.123f;
    result = c == 1.123;
    int d;
    result = (d = reader.read()) == -1;

    short s = 1;
    result = s == Short.MAX_VALUE;
    result = s == Short.MIN_VALUE;
    result = s > Short.MAX_VALUE - 1;
    result = s >= Short.MIN_VALUE + 1;
    result = Short.MAX_VALUE - 1 < s;
    result = Short.MAX_VALUE >= s;

    int i = 0;
    result = i == (long) Integer.MAX_VALUE;
    long l = 0;
    result = l == (double) Long.MIN_VALUE;
    result = l == Long.MAX_VALUE;
    String text = "value is: " + b;
    result = i + 1 == 5000000000L;
    result = b + 1 == 300;
    result = i == l;
  }
}

class S13Overflow {
  static final int C = 1;
  static final long GOLDEN_GAMMA = 0x9e3779b97f4a7c15L;
  private static final int MASK = (1 << 31);

  void g(int x) {}

  void f(int[] xs) {
    if (1000 * 1000 * 1000 * 10 * 1L == 0)
      ;
    int x = (int) (1000 * 1000 * 1000 * 10 * 1L);
    int y = 1000 * 1000 * 1000 * 10;
    g(C * 1000 * 1000 * 1000 * 10);
    System.err.println(2 * GOLDEN_GAMMA);
    for (final int z : xs) {
      final int w = (z & (MASK - 1));
    }
    int division = 1 / 0;
    int remainder = 5 % 0;
    long longDivision = 7L / (3 - 3);
    var v = 1 + Integer.MAX_VALUE;
    var u = Integer.MAX_VALUE + 1;
    int tern = true ? 1000 * 1000 * 1000 * 10 : 0;
    int tern2 = C == 1 ? 5 : 1000 * 1000 * 1000 * 10;
    int neg = -Integer.MAX_VALUE - 2;
    int minus = Integer.MIN_VALUE - 1;
    int plus = Integer.MAX_VALUE + 1;
    int paren = (1000 * 1000 * 1000 * 10);
    int nested = ((65536 * 65536) + 1) * 2;
    int shifted = 1 << 40;
    long big = Long.MAX_VALUE * 2;
    long add = Long.MAX_VALUE - 1 + 2;
    int hex = 0x7fffffff + 0x7fffffff;
    int cast = (short) 1000 * 1000 * 1000 * 100;
    int bytes = (byte) 100 * 100 * 100 * 100 * 100;
    int call = foo(1000 * 1000 * 1000 * 10);
    int viaNested = foo(1000 * 1000 * 1000 * 10) + 1;
    int array[] = {1000 * 1000 * 1000 * 10};
    Runnable r = () -> g(1000 * 1000 * 1000 * 10);
  }

  int foo(int i) {
    return i;
  }

  Long a = 1000 * 1000 * 1000 * 10 * 1L;
  int b = (int) 24L * 60 * 60 * 1000 * 1000;
  long c = (long) 24L * 60 * 60 * 1000 * 1000;
  long d = 24 * 60 * 60 * 1000 * 1000;
  int e1 = 24 * 60 * 60 * 1000 * 1000, e2 = 3;

  @SuppressWarnings("ConstantOverflow")
  int suppressed = 1000 * 1000 * 1000 * 10;

  void negative() {
    int a = (int) (10 / 0.5);
    char b = (char) Integer.MAX_VALUE;
    char c = (char) -1;
    char d2 = (char) 1;
    byte e = (byte) 0b1000_0000;
    byte f = (byte) 0x80;
    byte g = (byte) 0xfff;
    byte h = (byte) -1;
    long microDay = 24L * 60 * 60 * 1000 * 1000;
    int i = 'a' + Integer.MAX_VALUE;
    int j = 1000 * 1000;
    float k = 1000000f * 1000000f;
    double l = 1e300 * 1e300;
    boolean m = 1000 * 1000 * 1000 * 10 == 0 && true;
    int n = Integer.MAX_VALUE * 1;
    int o = false ? 1000 * 1000 * 1000 * 10 : 1;
    int p = 1 << 31;
    int q = -2147483648;
    int r = -2147483648 - 1;
    long s = -9223372036854775808L;
  }
}

class S13Xor {
  static final int X = 2 ^ 16;
  static final int TOO_BIG = 2 ^ 32;
  static final int Z = 2 ^ 31;
  static final int P = 10 ^ 6;
  static final int HEX = 2 ^ 0x16;
  static final int TEN_BIG = 10 ^ 10;
  static final long LX = 2L ^ 16;
  static final long LY = 2L ^ 32;
  static final long LZ = 2L ^ 31;
  static final long L_TOO_BIG = 2L ^ 64;
  static final long LP = 10L ^ 6;
  static final long LP_BIG = 10L ^ 19;
  static final int THREE = 3 ^ 4;
  static final int ZERO_BASE = 0 ^ 16;
  static final int OCT = 2 ^ 010;
  static final int ZERO = 2 ^ 0;
  static final int PAREN = (2) ^ 3;
  static final int NAMED = 2 ^ X;
  static final int ARITH = 1 + 2 ^ 16;
  static final int XOR3 = 2 ^ 3 ^ 4;

  void f(int i) {
    int x = i * 2 ^ 16;
    int y = i * 10 ^ 3;
    int z = i + 2 ^ 5;
    int w = (i * 2) ^ 5;
    int assign = i;
    assign ^= 2;
    boolean flag = true ^ false;
  }

  @SuppressWarnings("XorPower")
  static final int SUPPRESSED = 2 ^ 8;
}
