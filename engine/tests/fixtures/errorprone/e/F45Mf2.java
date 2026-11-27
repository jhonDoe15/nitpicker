package e;

import java.io.IOException;
import org.junit.Test;

public class F45Mf2 {
  void thrower() throws IOException {}

  @Test
  @SuppressWarnings("missing-fail")
  public void suppressedByAltName() {
    try {
      thrower();
    } catch (IOException expected) {
    }
  }

  @Test
  public void inAnonymous() {
    new Object() {
      void g() {
        try {
          thrower();
        } catch (IOException expected) {
        }
      }
    };
  }

  @Test
  public void inLambda() {
    Runnable r = () -> {
      try {
        thrower();
      } catch (IOException expected) {
      }
    };
  }

  @Test
  public void declarators() {
    try {
      int a = 1, b = 2;
    } catch (RuntimeException expected) {
    }
  }
}
