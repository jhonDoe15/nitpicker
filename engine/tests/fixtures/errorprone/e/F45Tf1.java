package e;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.io.IOException;
import org.junit.Test;

public class F45Tf1 {
  void thrower() throws IOException {}
  int value() throws IOException { return 1; }

  @Test
  public void plain() {
    try {
      thrower();
      fail();
    } catch (IOException expected) {
    }
  }

  @Test
  public void used() {
    try {
      thrower();
      fail("x");
    } catch (IOException e) {
      assertEquals("m", e.getMessage());
    }
    try {
      int v = value();
      fail();
    } catch (IOException e) {
      assertEquals("n", e.getMessage());
    }
  }

  @Test
  public void onlyFail() {
    try {
      fail();
    } catch (AssertionError e) {
    }
  }

  @Test
  public void withFinally() {
    try {
      thrower();
      fail();
    } catch (IOException e) {
    } finally {
      value2();
    }
  }

  void value2() {}

  public void notATest() {
    try {
      thrower();
      fail();
    } catch (IOException e) {
    }
  }

  @Test
  public void testLambda() {
    Runnable r = () -> {
      try {
        thrower();
        fail();
      } catch (IOException e) {
        e.printStackTrace();
      }
    };
  }
}
