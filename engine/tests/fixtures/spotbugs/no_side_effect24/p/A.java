package p;
public class A {
  static Object s(Object t) throws java.io.IOException { return t; }
  Object u(Object t) throws java.io.IOException { return t; }
  static Object w(Object t) throws IllegalStateException { return t; }
  static int x(int t) throws Exception { return t + 1; }
  void a(Object t) throws Exception { s(t); u(t); w(t); x(1); }
}
