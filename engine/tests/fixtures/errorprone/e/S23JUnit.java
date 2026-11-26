package e;

import static org.junit.Assert.assertThrows;

import org.junit.After;
import org.junit.AfterClass;
import org.junit.Assert;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;

class S23JUnit {
  static class ExtendsPositive extends Assert {
    @Test
    public void test() {
      assertEquals(1, 1);
      assertTrue(true);
    }
  }

  static class ExtendsQualified extends org.junit.Assert {
    @Test
    public void test() {
      assertTrue(true);
      Assert.assertEquals(1, 1);
    }
  }

  static class ExtendsGeneric<T extends Number> extends Assert {
    void foo() {
      fail();
    }
  }

  static class ExtendsNegative extends ExtendsPositive {}

  static class ExtendsPlain {
    void foo() {
      Assert.assertTrue(true);
    }
  }

  @SuppressWarnings("ExtendingJUnitAssert")
  static class ExtendsSuppressed extends Assert {}

  static class EmptyPositive {
    @Before
    public void before() {}

    @After
    public void after() {}

    @BeforeClass
    public static void beforeClass() {}

    @AfterClass
    public static void afterClass() {}
  }

  static class EmptyNegative {
    @Before
    public void before() {
      int x = 1;
    }

    @After
    public void withComment() {
      // nothing to do
    }

    @Test
    public void test() {}

    @Before
    public void withBlockComment() {
      /* nothing */
    }

    public void plain() {}
  }

  static class EmptyWithSuper extends EmptyPositive {
    @Before
    public void before2() {}
  }

  static class EmptyWithInterface implements Runnable {
    @Before
    public void before() {}

    @Override
    public void run() {}
  }

  static class EmptySuppressed {
    @SuppressWarnings("JUnit4EmptyMethods")
    @Before
    public void before() {}
  }

  interface Thrower {
    void run() throws Exception;
  }

  void helper() {}

  int value() {
    return 1;
  }

  void blockToExpression() {
    assertThrows(
        IllegalStateException.class,
        () -> {
          helper();
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          int x = value();
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          // a comment
          helper(); // trailing
        });
    Assert.assertThrows(
        IllegalStateException.class,
        () -> {
          /* before */ helper();
          /* after */
        });
    assertThrows(IllegalStateException.class, () -> helper());
    assertThrows(
        IllegalStateException.class,
        () -> {
          helper();
          helper();
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          if (value() > 0) {
            helper();
          }
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          int x = 1, y = 2;
        });
    assertThrows(
        IllegalStateException.class,
        () -> {
          int x;
        });
  }

  @SuppressWarnings("AssertThrowsBlockToExpression")
  void suppressed() {
    assertThrows(
        IllegalStateException.class,
        () -> {
          helper();
        });
  }
}
