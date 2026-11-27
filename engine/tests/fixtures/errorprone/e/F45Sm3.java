package e;

import org.mockito.Mock;

class F45Sm3 {
  Runnable early = g;
  @Mock static Runnable g;
  Runnable late = h;
  @Mock static Runnable h;
  { Runnable x = i; }
  @Mock static Runnable i;
  Runnable viaThis = this.j;
  @Mock static Runnable j;
  Runnable inLambda = () -> k.run();
  @Mock static Runnable k;

  F45Sm3() { this(l); }
  F45Sm3(Runnable r) {}
  @Mock static Runnable l;

  @Mock static Runnable m;
  static Runnable copy = m;

  @Mock static Runnable n;
  static void anon() {
    new Object() { void f() { n.run(); } };
  }

  @Mock static Runnable o;
  void lambdaInInstance() { Runnable r = () -> o.run(); }

  @Mock static Runnable p;
  class Inner { void f() { p.run(); } }

  @Mock static Runnable q;
  interface Nested { default void f() { } }
  enum E { A { void f() { } } }

  @Mock static Runnable s;
  @Mock static Runnable t;
}

class F45Sm3Sub extends F45Sm3 {
  static void f() { s.run(); }
  void g() { t.run(); }
}

enum F45Sm3Enum {
  A {
    void f() { pv.run(); pub.run(); }
  },
  B;
  static Runnable later() { return arg; }
  F45Sm3Enum() {}
  F45Sm3Enum(Runnable r) {}
  @Mock private static Runnable pv;
  @Mock static Runnable pub;
  @Mock static Runnable arg;
}
