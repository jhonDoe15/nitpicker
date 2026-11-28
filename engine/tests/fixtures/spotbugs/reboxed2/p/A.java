package p;
import java.util.*;
import java.util.function.*;
public class A {
  void a(Integer x, List<Integer> l) {
    l.add(x.intValue());
    l.add(x.intValue());
  }
  Integer b(Integer x, boolean c) {
    return c
      ? 0
      : x;
  }
  void c(Integer x, List<Integer> l) {
    l.add(
      x
        .intValue());
  }
  Supplier<Integer> d(Integer x) { return () -> x.intValue(); }
  Integer e(Integer x, boolean c, boolean d) { return c ? 1 : d ? 2 : x; }
  Integer f(Map<String, Integer> m) { return Integer.valueOf(m.get("a")); }
  Boolean g(Boolean x, boolean c) { return c ? false : x; }
  Boolean h(Boolean x) { return x.booleanValue(); }
  Long i(Long x) { return x.longValue(); }
  Integer j(Integer x, boolean c) { return (c ? 0 : x); }
  Integer k(Integer x, boolean c) { Integer y; y = c ? 0 : x; return y; }
  Object m(Integer x, boolean c) { return c ? "s" : x.intValue(); }
  Integer n(Integer x, Integer z, boolean c) { return c ? z.intValue() : x; }
  int o(Integer x) { return x.intValue(); }
  Integer p(int[] a, Integer x) { a[0] = 1; return x.intValue(); }
  Integer q(Integer x) { Integer y = x.intValue(); Integer z = x.intValue(); return y + z; }
  Integer r(Integer x) {
    Integer y = x.intValue();
    Integer z = x.intValue();
    return y + z;
  }
  static Integer s = Integer.valueOf(1).intValue();
  Integer t(Integer x, boolean c) { return switch (x) { case 1 -> 0; default -> x; }; }
  Integer u(Integer x) { return Integer.valueOf((int) x); }
  Integer v(Integer x) { return (Integer) x.intValue(); }
  Integer w(Integer x) { return x == null ? null : x.intValue(); }
}
