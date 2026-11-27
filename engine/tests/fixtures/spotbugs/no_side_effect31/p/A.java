package p;
public class A {
  interface K { Object m() throws java.io.IOException; }
  static class K1 implements K { public Object m() { return null; } }
  static class K2 implements K { public Object m() { return this; } }
  static Object w(K k) throws java.io.IOException { return k.m(); }
  static Object v(K1 k) { return k.m(); }
  void a(K k, K1 k1) throws Exception { w(k); v(k1); }
}
