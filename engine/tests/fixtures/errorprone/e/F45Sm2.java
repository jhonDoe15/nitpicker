package e;

import org.mockito.Mock;

interface F45Sm2 {
  @Mock Runnable implicit = null;
  @Mock static Runnable explicit = null;
}

record F45Sm2R(int x) {
  @Mock static Runnable r;
}

enum F45Sm2E {
  A;
  @Mock static Runnable m;
}

class F45Sm2Other {
  void f() {
    F45Sm1.a.run();
  }
}
