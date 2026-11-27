package p;
import java.util.*;
public class B {
  Optional<String> a(boolean c) {
    if (c) return null;
    return null;
  }
  Optional<String> b(boolean c) { return c ? null : Optional.of("x"); }
  Optional<String> c(boolean c) {
    return c
        ? Optional.of("x")
        : null;
  }
  <T> Optional<T> d() { return null; }
  Optional<String> e() { try { return null; } finally { System.out.println(); } }
  Optional<String> f() { synchronized (this) { return null; } }
  Optional<String> g() { try { return Optional.of(""); } catch (RuntimeException x) { return null; } }
  Optional<String> h(boolean a, boolean b) { return a ? Optional.empty() : b ? Optional.empty() : null; }
  Optional<String> i(boolean a, boolean b) { return a ? (b ? Optional.empty() : null) : Optional.empty(); }
  Optional<String> j() {
    return
      null;
  }
  Optional<?> k() { return null; }
  Optional l() { return null; }
  Optional<String> m(boolean c) { if (c) { return null; } return Optional.empty(); }
  Optional<String> n() { while (true) { if (Math.random() > 0) return null; } }
  enum E { X; Optional<String> o() { return null; } }
  record R(int x) { Optional<String> p() { return null; } }
  Optional<String> q() { Runnable r = () -> {}; return null; }
  Optional<String> s() { throw new RuntimeException(); }
  abstract static class Q { abstract Optional<String> t(); }
  Optional<String> u() { Optional<String> v = null; return null; }
}
