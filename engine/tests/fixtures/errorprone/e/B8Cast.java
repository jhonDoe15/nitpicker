package e;

import java.util.List;

class B8Cast {
  long mul(double f, long a, long b, int c) {
    long r1 = (long) f * a;
    long r2 = (long) f * a * b;
    long r3 = (long) f * a + b;
    long r4 = a * (long) f;
    long r5 = a + (long) f * b;
    long r6 = (long) (f * a);
    long r7 = (long) f / a;
    long r8 = (long) f + a;
    long r9 = (long) f * a * b * c;
    int i1 = (int) f * c;
    int s = (short) f * c;
    int ch = (char) f * c;
    int by = (byte) f * c;
    return r1 + r2 + r3 + r4 + r5 + r6 + r7 + r8 + r9 + i1 + s + ch + by;
  }

  void floats(float f, Double boxed, Float boxedF, int i) {
    long a = (long) f * 2;
    long b = (long) (double) boxed * 2;
    long c = (long) boxed.doubleValue() * 2;
    long d = (int) i * 2;
    double e = (double) i * 2;
    float g = (float) f * 2;
    long h = (long) (f) * 2;
  }

  void math(double d, int i, long l, float f, Integer boxedInt, char ch) {
    long a = (long) Math.floor(d) * 2;
    long b = (long) Math.ceil(d) * 2;
    long c = (long) Math.signum(d) * 2;
    long e = (long) Math.rint(d) * 2;
    long g = (long) Math.sqrt(d) * 2;
    long h = (long) Math.pow(i, 2) * 2;
    long j = (long) Math.pow(l, boxedInt) * 2;
    long k = (long) Math.pow(d, 2) * 2;
    long m = (long) Math.pow(2, f) * 2;
    long n = (long) Math.pow(ch, 2) * 2;
    long o = (long) Math.abs(d) * 2;
    long p = (long) StrictMath.floor(d) * 2;
    long q = (long) (Math.floor(d)) * 2;
  }

  String strings(double d) {
    return "" + (long) d * 2;
  }

  void compound(double d, long x) {
    x *= (long) d * 2;
    long y = ((long) d) * 2;
    long z = (long) d * 2 * 3 + 1;
  }

  long suppressed(double d) {
    @SuppressWarnings("FloatCast")
    long a = (long) d * 2;
    return a;
  }

  int bits(double d, int x) {
    return (int) d * x << 2;
  }

  boolean compare(double d, long x) {
    return (long) d * x > 3;
  }

  long unaryRight(double d, long x) {
    return x * (long) d * 2;
  }
}
