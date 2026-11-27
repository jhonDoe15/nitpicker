package e;

import static org.junit.Assert.assertThrows;

import java.util.function.Supplier;

public class F45Am4 {
  void take(Object o) {}

  <T extends Runnable> void variableReceiver(Supplier<T> s) {
    assertThrows(IllegalStateException.class, () -> s.get().run());
  }

  <T> void variableCast(T t) {
    assertThrows(IllegalStateException.class, () -> take((String) t));
  }
}
