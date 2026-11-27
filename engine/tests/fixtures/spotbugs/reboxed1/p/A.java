package p;
import java.util.*;
public class A {
  Integer f; Long lf; Object o;
  Integer a(Integer x) { return x.intValue(); }
  Integer b(Integer x) { Integer y = x.intValue(); return y; }
  Integer c(Integer x, boolean c) { return c ? x : 0; }
  Integer d(Integer x, boolean c) { return c ? 0 : x; }
  Integer e(Integer x) { return Integer.valueOf(x); }
  Integer g(Integer x) { return (int) x; }
  Long h(Integer x) { return x.longValue(); }
  Long i(Long x, boolean c) { return c ? x : 0L; }
  Boolean j(Boolean x, boolean c) { return c ? x : false; }
  Double k(Double x, boolean c) { return c ? x : 0.0; }
  void l(Integer x, Map<String, Integer> m) { m.put("a", x.intValue()); }
  void n(Integer x) { f = x.intValue(); }
  Object q(Integer x) { return x.intValue(); }
  Integer r(Integer x) { int t = x; return t; }
  Integer s(Integer x) { return new Integer(x.intValue()); }
  Integer t(Integer x, boolean c) { Integer y = c ? x : null; return y; }
  Integer u(Integer x, Integer z, boolean c) { return c ? x : z; }
  Integer v(Integer x, int z, boolean c) { return c ? x : z; }
  Integer w(Integer x, boolean c, boolean d) { return c ? x : d ? 1 : 2; }
  Integer x2(Integer x) { return x == null ? 0 : x; }
  Integer y(Integer x) { return x != null ? x : 0; }
  Integer z(Integer x) { return x + 0; }
  Character ch(Character x) { return x.charValue(); }
  Integer[] arr(Integer x) { return new Integer[] { x.intValue() }; }
  Integer cast(Object o) { return (Integer) o; }
  Integer castInt(Object o) { return (int) (Integer) o; }
  Integer num(Number n) { return n.intValue(); }
  Short sh(Short x) { return x.shortValue(); }
  Integer twice(Integer x) { return x.intValue() + x.intValue(); }
}
