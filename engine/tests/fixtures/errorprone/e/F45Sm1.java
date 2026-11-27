package e;

import org.mockito.Mock;

class F45Sm1 {
  @Mock static Runnable a;
  @Mock private static Runnable b;
  @Mock Runnable fine;
  static @Mock Runnable c;
  @Mock static Runnable d, e;

  static void useB() {
    b.run();
  }

  static class Nested {
    void use() {
      c.run();
    }
  }

  @org.mockito.Mock
  public static final Runnable f = null;
}
