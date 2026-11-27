package p;
public class A {
  static class Base<T> { T get(T x) { int y = 1; return x; } }
  static class Sub extends Base<String> { String get(String x) { System.out.println(x); return x; } }
  static class Base2<T> { T get(T x) { return x; } }
  static class Sub2 extends Base2<String> { String get(String x) { return x; } }
  void m(Base<String> b, Base2<String> c, Sub2 d) { b.get("a"); c.get("a"); d.get("a"); }
}
