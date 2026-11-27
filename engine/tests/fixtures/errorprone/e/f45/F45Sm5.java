package f45;

import org.mockito.Mock;

class F45Sm5 {
  @Mock static Runnable viaSub;
  @Mock static Runnable inner;

  class In {
    In() {
      this(inner);
    }

    In(Runnable r) {}
  }
}

class F45Sm5Sub extends F45Sm5 {}
