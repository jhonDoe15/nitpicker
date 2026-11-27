package p;
public class A {
  static abstract class B { abstract Object m(Object t) throws java.io.IOException; }
  static class C extends B { Object m(Object t) { return t; } }
  static class D { Object m(Object t) throws java.io.IOException { return t; } }
  static class E extends D { Object m(Object t) { return t; } }
  interface F { default Object m(Object t) throws java.io.IOException { return t; } }
  static class G implements F { }
  void a(B b, D d, F f, Object t) throws Exception { b.m(t); d.m(t); f.m(t); }
}
