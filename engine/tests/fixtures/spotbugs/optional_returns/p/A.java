package p;
import java.util.*;
public class A {
  Optional<String> a() { return null; }
  Optional<String> b(boolean c) { if (c) return Optional.empty(); return null; }
  Optional<String> c(boolean c) { return c ? Optional.of("x") : null; }
  Optional<String> d() { Optional<String> o = null; return o; }
  com.google.common.base.Optional<String> e() { return null; }
  OptionalInt f() { return null; }
  Object g() { return null; }
  Optional<String> h(Optional<String> x) { return x; }
  static Optional<String> i() { return null; }
  Optional<String> j(boolean c) { if (c) { return null; } else { return null; } }
  Optional<String> k() { return (Optional<String>) null; }
  java.util.function.Supplier<Optional<String>> l() { return () -> null; }
  Optional<String> m() { return new Object() { Optional<String> n() { return null; } }.n(); }
  Optional<String> o() { try { return Optional.empty(); } finally { } }
  Optional<String> q(int x) { switch (x) { case 1: return null; default: return Optional.empty(); } }
  Optional<String> r(int x) { return switch (x) { case 1 -> null; default -> Optional.empty(); }; }
  OptionalLong s() { return null; }
  OptionalDouble t() { return null; }
}
interface I { default Optional<String> u() { return null; } }
