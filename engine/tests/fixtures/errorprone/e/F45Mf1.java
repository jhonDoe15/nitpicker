package e;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.IOException;
import org.junit.Test;

public class F45Mf1 {
  int counter;
  boolean flag;
  String e;

  void thrower() throws IOException {}
  int value() throws IOException { return 1; }

  @Test
  public void plain() {
    try {
      thrower();
    } catch (IOException expected) {
    }
  }

  @Test
  public void withAssert() {
    try {
      thrower();
    } catch (IOException e) {
      assertEquals("m", e.getMessage());
    }
  }

  @Test
  public void twice() {
    try {
      thrower();
    } catch (IOException expected) {
      assertEquals("m", expected.getMessage());
    }
    try {
      int v = value();
    } catch (IOException expected) {
      assertEquals("n", expected.getMessage());
    }
  }

  @Test
  public void hoisted() {
    try {
      // first
      int a = 1;
      thrower();
    } catch (IOException expected) {
    }
  }

  @Test
  public void failed() {
    try {
      thrower();
      fail();
    } catch (IOException expected) {
    }
  }

  @Test
  public void thrown() {
    try {
      thrower();
    } catch (IOException expected) {
      throw new RuntimeException();
    }
  }

  @Test
  public void tolerated() {
    try {
      thrower();
    } catch (IOException tolerated) {
    }
  }

  @Test
  public void notExpected() {
    try {
      thrower();
    } catch (IOException other) {
    }
  }

  @Test
  public void fieldAssigned() {
    try {
      thrower();
    } catch (IOException e) {
      counter = 1;
      assertTrue(true);
      assertEquals(1, 1);
    }
  }

  @Test
  public void booleanVar() {
    try {
      thrower();
    } catch (IOException e) {
      assertTrue(flag);
    }
  }

  @Test
  public void lastAsserts() {
    try {
      thrower();
      assertEquals(1, counter);
    } catch (IOException e) {
      assertEquals("m", e.getMessage());
    }
  }

  @Test
  public void inLoop() {
    for (int i = 0; i < 2; i++) {
      try {
        thrower();
      } catch (IOException expected) {
      }
    }
  }

  @Test
  public void returns() {
    try {
      thrower();
    } catch (IOException expected) {
    }
    return;
  }

  @Test
  public void unequal() {
    try {
      thrower();
    } catch (IOException expected) {
      assertEquals(1, 2);
    }
  }

  @Test
  public void interrupted() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException expected) {
    }
  }

  @Test
  public void multi() {
    try {
      thrower();
    } catch (IOException | RuntimeException expected) {
    }
  }

  @Test
  public void twoCatches() {
    try {
      thrower();
    } catch (IOException expected) {
    } catch (RuntimeException e) {
    }
  }

  @Test
  public void resources() throws Exception {
    try (java.io.StringReader reader = new java.io.StringReader("")) {
      reader.read();
    } catch (IOException expected) {
    }
  }

  @Test
  public void oneLine() { try { thrower(); } catch (IOException e) { assertEquals("m", e.getMessage()); } }

  @Test
  public void statementTarget() {
    try {
      if (counter > 0) {
        thrower();
      }
    } catch (IOException expected) {
    }
  }

  @Test
  public void assignmentTarget() {
    int x;
    try {
      x = value();
    } catch (IOException expected) {
    }
  }

  @Test
  public void logged() {
    try {
      thrower();
    } catch (IOException expected) {
      java.util.logging.Logger.getGlobal().info("x");
    }
  }

  public void setUp() {
    try {
      thrower();
    } catch (IOException expected) {
    }
  }
}

class F45Mf1NotTest {
  void thrower() throws java.io.IOException {}

  void f() {
    try {
      thrower();
    } catch (java.io.IOException expected) {
    }
  }
}
