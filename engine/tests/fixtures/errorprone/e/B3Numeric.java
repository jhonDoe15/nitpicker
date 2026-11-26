package e;

import static java.util.Comparator.comparing;

import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

class B3Numeric {
  static final long BIG = 1L << 60;
  static final int SECOND = 1000;

  double sqrt(long value, int small, long other) {
    double a = Math.sqrt(value);
    double b = Math.sqrt(small);
    double c = Math.sqrt(1L);
    double d = Math.sqrt(BIG + 1);
    double e = Math.sqrt(BIG);
    double f = Math.sqrt(value + other);
    double g = Math.sqrt((value));
    double h = Math.sqrt(value > 0 ? value : other);
    long i = Math.abs(value);
    double j = Math.pow(value, other);
    double k = Math.max(value, 1.5);
    return Math.sqrt((long) small);
  }

  void takesDouble(double d) {}

  void takesBoth(double d, long l) {}

  void call(long x) {
    takesDouble(x);
    takesDouble(x * 2);
    takesBoth(x, x);
  }

  double divide(int a, int b, long c, float f) {
    double d1 = a / b;
    double d2 = a / 2;
    double d3 = 2 / a;
    float d4 = a / b;
    double d5 = 4 / 2;
    double d6 = 5 / 2;
    double d7 = c / b;
    double d8 = a / b * 2.0;
    double d9 = a / 2L;
    double d10 = a / 2f;
    double d11 = a / 0x10D;
    int ok = a / b;
    double ok2 = a / (double) b;
    double ok3 = f / a;
    Double boxed = (double) (a / b);
    return a / b;
  }

  long multiply(int a, int b, long c) {
    long m1 = a * b;
    long m2 = a * 1000;
    long m3 = 1000 * 1000;
    long m4 = 100000 * 100000;
    long m5 = SECOND * SECOND;
    long m6 = a * c;
    long m7 = a * b * c;
    int ok = a * b;
    long m8 = (a * b) + c;
    long m9 = a * 3;
    m9 += a * b;
    long[] arr = new long[] {a * b, c};
    return a * b;
  }

  void boxedCompare(Integer a, Integer b, Long c, int p) {
    boolean x = a == b;
    boolean y = a != b;
    boolean z = a == p;
    boolean w = a == null;
    boolean v = c == c;
    boolean u = a.equals(b) || a == b;
    boolean t = a == b || a.equals(b);
    boolean s = a == b || Objects.equals(a, b);
    boolean r = b == a || a.equals(b);
    boolean q = Integer.valueOf(p) == Integer.valueOf(p);
    boolean o = new Integer(p) == a;
    boolean n = (a + 1) == a;
    Object obj = a;
    boolean m = a == obj;
    boolean l = (a) == (b);
    boolean k = a == 127;
    boolean j = Boolean.TRUE == Boolean.valueOf(true);
  }

  List<String> compare(List<String> list, Map<String, Integer> map) {
    Comparator<String> a = Comparator.comparing(s -> s.length());
    Comparator<String> b = Comparator.comparing(String::length);
    Comparator<String> c = comparing(String::length);
    Comparator<String> d = Comparator.comparing(s -> (long) s.length());
    Comparator<String> e = Comparator.comparing(s -> map.get(s));
    Comparator<String> f = Comparator.comparing(s -> {
      return s.length() * 2.0;
    });
    Comparator<String> g = Comparator.comparing(String::trim);
    Comparator<String> h = a.thenComparing(String::length);
    Comparator<String> i = a.thenComparing(s -> s.length() * 2L);
    Comparator<String> j = Comparator.<String, Integer>comparing(s -> s.length());
    Comparator<String> k = a.thenComparing(Comparator.comparing(String::trim));
    Comparator<String> l = Comparator.comparing(String::length, Comparator.reverseOrder());
    Comparator<String> m = Comparator.comparing((String s) -> s.charAt(0));
    return list;
  }
}

class B3Varargs {
  void run() {
    String.format("a", new Object[] {1, 2});
    String.format("a", new Object[] {});
    String.format("a", new Object[2]);
    String.format("a", new Object[] {1});
    Arrays.asList(new String[] {"a", "b"});
    Arrays.asList(new String[] {"a", "b",});
    Arrays.asList(new String[] {});
    Arrays.asList(new String[0]);
    Arrays.asList(new String[][] {{"a"}});
    Arrays.asList(new String[] {"a"}, new String[] {"b"});
    Object o = String.format("a", (Object[]) new String[] {"a"});
    new B3Varargs("x", new String[] {"a"});
    new B3Varargs(new String[] {"a"});
    Arrays.asList(Arrays.asList(new String[] {"a"}).toArray(new String[] {}));
  }

  B3Varargs(String a, String... rest) {}

  B3Varargs(String... rest) {
    this("x", new String[] {"a"});
  }

  void format(String s, Object... args) {
    String.format(s, new Object[] {args});
    format(s, new Object[] {args});
  }
}
