package p;
public class A {
  enum En { A(1); En(int x) { System.out.println(x); } static int one() { return 1; } }
  static int noisy() { System.out.println(); return 1; }
  interface K { int V = noisy(); static int s() { return 1; } }
  enum Quiet { X, Y; static int two() { return 2; } }
  void m() { En.one(); K.s(); Quiet.two(); }
}
