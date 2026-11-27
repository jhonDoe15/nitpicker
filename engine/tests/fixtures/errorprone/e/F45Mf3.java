package e;

import static org.junit.Assert.assertEquals;

import java.util.function.Supplier;
import junit.framework.TestCase;

public class F45Mf3 extends TestCase {
  static class FailingThing {}

  void supplier(Supplier<Object> s) {}
  void thrower() {}

  public void testConstructorReference() {
    try {
      supplier(FailingThing::new);
    } catch (IllegalStateException expected) {
    }
  }

  public void testCommentBeforeReturn() {
    try {
      thrower();
    } catch (IllegalStateException expected) {
    }
    // done
    return;
  }

  public F45Mf3() {
    try {
      thrower();
    } catch (IllegalStateException expected) {
    }
    return;
  }
}
