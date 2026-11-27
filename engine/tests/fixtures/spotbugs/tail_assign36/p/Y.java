package p;
public class Y<T extends Number> { T t; Number n; Object r0() { return new Object[] { t, n }; }
  void a(T x, Number y) { t = t; n = n; }
  void b(Number y, T x) { t = t; n = n; }
  <U extends T> void c(U u, T x) { t = t; }
  <U extends Number & Comparable<U>> void d(U u, Number q) { n = n; }
  void e(Comparable<?> c, Number q) { n = n; }
  void f(java.util.List<T> l, java.util.List<Number> m) { }
}
