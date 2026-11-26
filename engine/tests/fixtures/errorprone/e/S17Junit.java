package e;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import java.util.ArrayList;
import java.util.List;
import junit.framework.TestCase;
import org.junit.Assume;
import org.junit.Ignore;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.JUnit4;

public class S17Junit extends TestCase {
  public void testDoubles(Double boxed, Float boxedFloat) {
    assertEquals(1.0, 2.0);
    assertEquals("msg", 1.0, 2.0);
    assertEquals(1.0, (Double) 1.0);
    assertEquals((Double) 1.0, 1.0);
    assertEquals((Double) 1.0, (Double) 1.0);
    assertEquals("message", 1.0, 1.0);
    assertEquals(1.0, 1.0, 0.0);
    assertEquals("message", 1.0, 1.0, 0.0);
    assertEquals(1, 1);
    assertEquals("abc", "abc");
    assertEquals(1.0, "abc");
    assertEquals(1.0f, 1.0f);
    assertEquals((Float) 1.0f, 1.0f);
    assertEquals((Float) 1.0f, (Float) 1.0f);
    assertEquals(1.0f, 2.0);
    assertEquals(1, 2.0);
    assertEquals(boxed, 2);
    assertEquals(boxed, boxedFloat);
    assertEquals(boxed, 'a');
    assertEquals(1.0, null);
    assertEquals("msg", "a", 1.0);
    assertEquals(true, 1.0);
    TestCase.assertEquals(1.0, 2.0);
    S17Junit.assertEquals(1.0f, 2.0f);
    assertEquals(2.0 + 1, boxed + 1);
  }

  @SuppressWarnings("JUnit3FloatingPointComparisonWithoutDelta")
  public void testSuppressed() {
    assertEquals(1.0, 2.0);
  }

  @Rule public int rule;

  @Ignore
  public void testIgnored() {
    Assume.assumeTrue(true);
    Assume.assumeNotNull(this);
    junit.framework.Assert.assertTrue(true);
  }

  public void testAssumeInLambda() {
    Runnable runnable = () -> Assume.assumeFalse(false);
    Object anonymous = new Object() {
      @Ignore
      void inner() {
        Assume.assumeTrue(true);
      }
    };
  }

  @SuppressWarnings("JUnit4ClassUsedInJUnit3")
  @Rule
  public int suppressedRule;

  static class Nested extends TestCase {
    @Rule public int nestedRule;

    public void testNested() {
      Assume.assumeTrue(true);
    }
  }
}

@Ignore
class S17IgnoredClass extends TestCase {
  public void testOne() {}
}

class S17PlainTest {
  @Rule public int rule;

  @Ignore
  @Test
  public void test() {
    Assume.assumeTrue(true);
  }
}

class S17AmbiguousTest extends TestCase {
  @Rule public int rule;

  @Test
  public void testOne() {
    Assume.assumeTrue(true);
  }
}

@RunWith(JUnit4.class)
class S17RunWithTest extends TestCase {
  @Ignore
  public void testOne() {}
}

class S17AmbiguousRunner extends TestCase {}

abstract class S17AbstractAmbiguous extends TestCase {
  @Test
  public void testOne() {}
}

@SuppressWarnings("JUnitAmbiguousTestClass")
class S17SuppressedAmbiguous extends TestCase {
  @Test
  public void testOne() {}
}

abstract class S17AbstractJunit3 extends TestCase {
  @Rule public int rule;
}

class S17Anonymous {
  void method() {
    TestCase anonymous =
        new TestCase() {
          @Test
          public void testOne() {}
        };
    TestCase plain =
        new TestCase() {
          @Rule public int rule;
        };
  }
}

class S17Types {
  static class Test1 {}

  interface Marker {}

  static final class Final implements Marker {}

  static <T extends String> void generic(T[] xs, T value, List<T> list) {
    assertArrayEquals(xs, new Double[] {1d});
    assertEquals(value, 1);
    assertEquals(list, new ArrayList<Integer>());
  }

  static <T extends Double> void compatible(T[] xs, T value) {
    assertArrayEquals(xs, new Double[] {1d});
    assertEquals(value, 1d);
  }

  void test(Object o, byte[] b, long[] longs, Test1 test, Final finals, Marker marker) {
    assertEquals(1, "");
    assertEquals("foo", 1, "");
    assertEquals("foo", "", 1);
    assertNotEquals(1, "");
    assertNotEquals("foo", 1, "");
    assertEquals(1, 2);
    assertEquals(1, 2L);
    assertEquals("foo", 1, 2);
    assertNotEquals(1, 2);
    assertNotEquals("foo", 1, 2);
    assertEquals((Object) 1, (Object) 2L);
    assertEquals(((Object) 1), (2L));
    assertEquals((long) 1, (Object) 2);
    assertEquals(o, "x");
    assertEquals(test, "x");
    assertEquals(finals, "x");
    assertEquals(marker, finals);
    assertEquals(new ArrayList<String>(), new ArrayList<Integer>());
    assertEquals(new ArrayList<String>(), new java.util.HashSet<String>());
    assertEquals(null, "x");
    assertEquals(Integer.valueOf(1), Long.valueOf(2));
    assertEquals(new StringBuilder(), "x");
    assertArrayEquals(new Test1[] {}, new String[] {""});
    assertArrayEquals("foo", new Test1[] {}, new String[] {""});
    assertArrayEquals(new long[] {1L}, new long[] {2L});
    assertArrayEquals((byte[]) o, b);
    assertArrayEquals("foo", new double[] {1}, new double[] {2}, 10d);
    assertArrayEquals(null, new Object[] {2});
    assertArrayEquals(new Object[] {1}, new String[] {""});
    assertArrayEquals(new Integer[] {1}, new String[] {""});
    junit.framework.TestCase.assertEquals(1, "");
    junit.framework.Assert.assertEquals(1, "");
    org.junit.Assert.assertEquals(1, "");
  }

  @SuppressWarnings("JUnitIncompatibleType")
  void suppressed() {
    assertEquals(1, "");
  }

  static class Sub extends TestCase {
    void inherited() {
      assertEquals(1, "");
      assertEquals("m", 1, "");
    }
  }
}
