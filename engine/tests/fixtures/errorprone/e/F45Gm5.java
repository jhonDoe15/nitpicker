package e;

import com.google.inject.AbstractModule;

class F45Gm5 extends AbstractModule {
  static int shared;
  int conditional;
  Object thrown;

  F45Gm5() {
    if (shared > 0) {
      conditional = 1;
    } else {
      conditional = 2;
    }
    thrown = null;
  }

  F45Gm5(int fails) {
    throw new IllegalStateException();
  }
}
