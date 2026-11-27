package e;

import static org.junit.Assert.assertThrows;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntFunction;
import java.util.function.Supplier;

public class F45Am3 {
  static byte[] bytes() { return null; }
  static Object make() { return null; }
  void take(Object o) {}
  void takeArray(int[][] values) {}
  void generate(IntFunction<String[]> f) {}
  void supply(Supplier<List<String>> s) {}

  void nestedInitializer() {
    assertThrows(IllegalStateException.class, () -> takeArray(new int[][] {{1}, {2}}));
  }

  void nestedInitializerCall() {
    assertThrows(IllegalStateException.class, () -> takeArray(new int[][] {{1}, {make().hashCode()}}));
  }

  void arrayReference() {
    assertThrows(IllegalStateException.class, () -> generate(String[]::new));
  }

  void genericReference() {
    assertThrows(IllegalStateException.class, () -> supply(ArrayList<String>::new));
  }

  void arrayReceiver() {
    assertThrows(IllegalStateException.class, () -> bytes().clone());
  }

  class Inner {
    void outerThis() {
      assertThrows(IllegalStateException.class, () -> take(F45Am3.this));
    }
  }
}
