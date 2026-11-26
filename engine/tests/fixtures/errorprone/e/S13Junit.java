package e;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.util.Arrays;
import junit.framework.AssertionFailedError;
import junit.framework.TestCase;
import junitparams.JUnitParamsRunner;
import junitparams.Parameters;
import org.junit.Assert;
import org.junit.Ignore;
import org.junit.Test;
import org.junit.experimental.theories.DataPoint;
import org.junit.experimental.theories.DataPoints;
import org.junit.experimental.theories.Theories;
import org.junit.experimental.theories.Theory;
import org.junit.runner.RunWith;
import org.junit.runners.JUnit4;

class S13TryFail {
  public static void emptyCatch_failNoMessage() {
    try {
      dummyMethod();
      Assert.fail();
    } catch (Throwable t) {
    }
  }

  public static void commentCatch_failNoMessage() {
    try {
      dummyMethod();
      Assert.fail();
    } catch (Throwable t123) {
      // expected!
      ;
      /* that's an empty comment */
    }
  }

  public static void commentCatch_failWithMessage() {
    try {
      dummyMethod();
      Assert.fail("Faaail!");
    } catch (Throwable t) {
      // expected!
    }
  }

  public static void commentCatch_failNotLast() {
    try {
      dummyMethod();
      fail("Faaail!");
      dummyMethod();
    } catch (Throwable t) {
      // expected!
    }
  }

  public static void commentCatch_assert() {
    try {
      dummyMethod();
      assertEquals(1, 2);
    } catch (Throwable t) {
      // expected!
    }
  }

  public static void commentCatch_assertNotLast() {
    try {
      dummyMethod();
      assertTrue("foobar!", true);
      dummyRecover();
    } catch (Throwable t) {
      // expected!
    }
  }

  public static void customMoreAsserts() {
    try {
      dummyMethod();
      CustomMoreAsserts.assertFoobar();
      dummyMethod();
    } catch (Throwable t) {
      // expected!
    }
  }

  public static void customMoreAsserts_fail() {
    try {
      dummyMethod();
      CustomMoreAsserts.fail("param", 0x42);
      dummyMethod();
    } catch (Throwable t) {
      // expected!
    }
  }

  static final class SomeTest extends TestCase {
    public void testInTestCase() {
      try {
        dummyMethod();
        fail("message");
      } catch (Throwable codeCatch_oldAssertFailWithMessage) {
        // comment
        /* another */
      }
    }
  }

  static final class CustomMoreAsserts {
    static void assertFoobar() {}

    static void fail(String param1, int param2) {}
  }

  private static void dummyRecover() {}

  private static void dummyMethod() {}

  public static void catchesAssertionError() {
    try {
      dummyMethod();
      Assert.fail();
    } catch (AssertionError e) {
    }
  }

  public static void hasMessage() {
    try {
      dummyMethod();
      Assert.fail("foo");
    } catch (AssertionError e) {
    }
  }

  public static void catchesFrameworkError() {
    try {
      dummyMethod();
      junit.framework.Assert.fail("framework");
    } catch (AssertionFailedError e) {
    }
  }

  public static void catchesError_lastStatement() {
    try {
      dummyMethod();
      Assert.fail();
    } catch (Error e) {
    }
  }

  public static void catchesError_notLastStatement() {
    try {
      dummyMethod();
      Assert.fail();
    } catch (Error e) {
    }

    assertTrue(true);
  }

  public static void catchesError_nested() {
    for (Object o : Arrays.asList()) {
      try {
        dummyMethod();
        Assert.fail();
      } catch (Error e) {
      }
    }
  }

  public static void catchesError_nestedNoBlock() {
    for (Object o : Arrays.asList())
      try {
        dummyMethod();
        Assert.fail();
      } catch (Error e) {
      }
  }

  public static void catchesError_withMessageNotLast() {
    try {
      dummyMethod();
      assertTrue("message", dummyBoolean());
    } catch (Error e) {
    }
    dummyMethod();
  }

  public static void finalCatchParameter() {
    try {
      Assert.fail("x");
    } catch (final Throwable t) {
    }
  }

  public static void withResources() throws Exception {
    try (java.io.StringReader reader = new java.io.StringReader("")) {
      Assert.fail("resource");
    } catch (Throwable t) {
    }
  }

  S13TryFail() {
    try {
      Assert.fail("constructor");
    } catch (Throwable t) {
    }
  }

  @SuppressWarnings("TryFailThrowable")
  public static void suppressed() {
    try {
      Assert.fail();
    } catch (Throwable t) {
    }
  }

  private static boolean dummyBoolean() {
    return true;
  }

  public static void withoutFail() {
    try {
      dummyMethod();
    } catch (Throwable t) {
      dummyRecover();
    }
  }

  public static void failOutsideTry() {
    try {
      dummyMethod();
    } catch (Throwable t) {
      dummyRecover();
    }
    Assert.fail();
  }

  public static void withoutCatch() {
    try {
      dummyMethod();
      Assert.fail("");
    } finally {
      dummyRecover();
    }
  }

  public static void multipleCatches() {
    try {
      dummyMethod();
      Assert.fail("1234");
    } catch (Error e) {
      dummyRecover();
    } catch (Throwable t) {
      dummyRecover();
    }
  }

  public static void nonEmptyCatch() {
    try {
      dummyMethod();
      Assert.fail("1234");
    } catch (Throwable t) {
      dummyRecover();
    }
  }

  public static void catchesException() {
    try {
      dummyMethod();
      Assert.fail("1234");
    } catch (Exception t) {
    }
  }

  public static void catchesUnion() {
    try {
      dummyMethod();
      Assert.fail("1234");
    } catch (IllegalStateException | IllegalArgumentException t) {
    }
  }

  public static void failInNestedBlock() {
    try {
      dummyMethod();
      if (dummyBoolean()) {
        Assert.fail("1234");
      }
    } catch (Throwable t) {
    }
  }

  public static void failInLambda() {
    try {
      dummyMethod();
      Runnable r = () -> Assert.fail("1234");
    } catch (Throwable t) {
    }
  }
}

@RunWith(JUnit4.class)
class S13Theory {
  @Theory
  public void test() {}
}

@RunWith(Theories.class)
class S13TheoryOk {
  @Theory
  public void test() {}
}

@RunWith(JUnit4.class)
class S13TheoryNone {}

@RunWith(JUnit4.class)
class S13TheoryField {
  @DataPoint public static int one = 1;

  @Test
  public void test() {}
}

@RunWith(JUnit4.class)
class S13TheoryMethod {
  @DataPoints
  public static int[] some() {
    return new int[] {1};
  }
}

@RunWith(org.junit.runners.JUnit4.class)
@SuppressWarnings("TheoryButNoTheories")
class S13TheorySuppressed {
  @Theory
  public void test() {}
}

class S13TheoryNoRunner {
  @Theory
  public void test() {}
}

@RunWith(JUnit4.class)
class S13TheoryNotRun {
  public void test() {}

  @Test
  public void other() {}
}

@RunWith(JUnitParamsRunner.class)
class S13Params {
  private static final String METHOD = "named1";

  private static Object[] dataProvider() {
    return new Object[] {1};
  }

  private static Object[] dataProvider1() {
    return new Object[] {2};
  }

  @Test
  @Parameters(method = "dataProvider, dataProvider1")
  public void paramStaticProvider(int a) {}

  @Test
  @Parameters(source = Inner.class, method = "dataProviderInner")
  public void testSource(int a) {}

  @Test
  @Parameters({"AAA,1", "BBB,2"})
  public void paramsInAnnotation(String p1, Integer p2) {}

  @Test
  @Parameters("AAA,1")
  public void paramsSingle(String p1, Integer p2) {}

  @Test
  @Parameters()
  public void paramsEmptyParens(String p1) {}

  @Test
  @Parameters
  public void paramsInDefaultMethod(String p1, Integer p2) {}

  private Object parametersForParamsInDefaultMethod() {
    return new Object[] {new Object[] {"AAA", 1}, new Object[] {"BBB", 2}};
  }

  @Test
  @Parameters(method = METHOD)
  public void paramsInNamedMethod(String p1, Integer p2) {}

  private Object named1() {
    return new Object[] {"AAA", 1};
  }

  @Test
  @Parameters(method = "named2,named3")
  public void paramsInMultipleMethods(String p1, Integer p2) {}

  private Object named2() {
    return new Object[] {"AAA", 1};
  }

  private Object named3() {
    return new Object[] {"BBB", 2};
  }

  @Test
  @Parameters
  public void missingDefault(String p1, Integer p2) {}

  @Test
  @Parameters(method = "named2,missing2,missing1, named3 ,")
  public void missingSeveral(String p1, Integer p2) {}

  @Test
  @Parameters(source = S13ParamsOther.class, method = "otherProvider")
  public void sourceElsewhere(int a) {}

  @Test
  @Parameters(source = S13ParamsOther.class, method = "missingProvider")
  public void sourceMissing(int a) {}

  @Test
  @Parameters(source = S13ParamsOther.class, method = "named1")
  public void sourceFallsBack(int a) {}

  @Test
  @Parameters(method = "toString")
  public void inheritedFromObject(int a) {}

  @Test
  @Ignore
  @Parameters
  public void ignored(String p1) {}

  @Parameters
  public void notATest(String p1) {}

  @Test
  @Parameters
  @SuppressWarnings("JUnitParameterMethodNotFound")
  public void suppressed(String p1) {}

  @Test
  @Parameters
  public void élan(String p1) {}

  static class Inner {
    public Object dataProviderInner() {
      return new Object[] {1};
    }
  }
}

class S13ParamsOther {
  public Object otherProvider() {
    return new Object[] {1};
  }
}

@RunWith(JUnit4.class)
class S13ParamsOtherRunner {
  @Test
  @Parameters(method = "named1")
  public void paramStaticProvider() {}
}

@RunWith(JUnitParamsRunner.class)
abstract class S13ParamsBase {
  public Object named1() {
    return new Object[] {1};
  }
}

@RunWith(JUnitParamsRunner.class)
class S13ParamsSub extends S13ParamsBase {
  @Test
  @Parameters(method = "named1")
  public void testNamed(int a) {}

  @Test
  @Parameters(method = "named9")
  public void testNamedMissing(int a) {}
}

@RunWith(JUnit4.class)
class S13Asserts {
  void plain() {
    assert true;
    assert true;
  }

  void parens() {
    assert (true);
  }

  void detail() {
    assert (true) : "description";
  }

  void detailVariable() {
    String desc = "description";
    assert (true) : desc;
  }

  void detailNonString() {
    Integer desc = 1;
    assert (true) : desc;
  }

  void falseCase() {
    boolean a = false;
    assert (!a);
  }

  void equalsCase() {
    String a = "test";
    assert a.equals("test");
    assert (a).equals(("test"));
  }

  void nullCase() {
    Integer a = null;
    assert a == null;
    assert null == a;
    assert a != null;
    assert null != a;
  }

  void primitiveCase() {
    int a = 1;
    Integer b = 2;
    assert a == 1;
    assert a != 1;
    assert b == 2;
    assert 1 != b;
  }

  void referenceCase() {
    Object a = "x";
    Object b = "y";
    assert a == b;
    assert a != b;
    assert (a == b) : "message";
  }

  void comparison() {
    int a = 1;
    assert a > 0;
  }

  void inLambda() {
    Runnable r = () -> {
      assert 1 > 0;
    };
  }

  void inAnonymous() {
    Object o =
        new Object() {
          void inner() {
            assert 2 > 1;
          }
        };
  }

  @SuppressWarnings("UseCorrectAssertInTests")
  void suppressed() {
    assert true;
  }

  abstract static class Abstract {
    abstract void nothing();
  }

  void noAsserts() {
    int a = 1;
  }
}

class S13AssertsNotTest {
  void plain() {
    assert true;
  }
}

class S13AssertsTestCase extends TestCase {
  void plain() {
    assert false;
  }
}

class S13AssertsMethod {
  @Test
  void plain() {
    assert true : "m";
  }
}
