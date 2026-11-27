package e;

import com.google.inject.AbstractModule;

class F45Gm6 extends AbstractModule {
  volatile int flag = 1;
  Object a = new Object(), b;
  Object c = new Object(), d;
  Object inherited = null;
  Object nestedName = new Object();
  Object viaSuper = null;
  Object plain;

  F45Gm6() {
    plain = null;
    d = null;
  }

  static class Builder {
    Object nestedName;

    Builder(Object nestedName) {
      this.nestedName = nestedName;
    }
  }
}

class F45Gm6Sub extends F45Gm6 {
  F45Gm6Sub() {
    inherited = new Object();
    super.viaSuper = new Object();
  }
}
