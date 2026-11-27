package e;

import static org.junit.Assert.fail;

import java.io.IOException;
import junit.framework.TestCase;

public class F45Tf2 extends TestCase {
  int total;

  int parse(String s) throws IOException { return 1; }

  public void testCompound() {
    try {
      total += parse("x");
      fail();
    } catch (IOException e) {
    }
  }

  public void testSwitch(int x) {
    try {
      parse("y");
      switch (x) {
        case 1:
          parse("z");
          break;
        default:
          break;
      }
      fail();
    } catch (IOException e) {
    }
  }

  public void testSuppressed() {
    @SuppressWarnings("TryFailRefactoring")
    Runnable r = () -> {
      try {
        parse("a");
        fail();
      } catch (IOException e) {
      }
    };
    try {
      parse("b");
      fail();
    } catch (IOException e) {
    }
  }
}
