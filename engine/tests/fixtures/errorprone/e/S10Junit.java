package e;

import junit.framework.TestCase;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Ignore;
import org.junit.Test;
import org.junit.experimental.runners.Enclosed;
import org.junit.experimental.theories.FromDataPoints;
import org.junit.experimental.theories.Theories;
import org.junit.experimental.theories.Theory;
import org.junit.internal.runners.JUnit38ClassRunner;
import org.junit.runner.RunWith;
import org.junit.runners.JUnit4;
import org.mockito.junit.MockitoJUnitRunner;

@RunWith(JUnit4.class)
public class S10Junit {
  @BeforeClass
  public void shouldDoSomething() {}

  @AfterClass
  public void shouldDoSomethingElse() {}

  @AfterClass
  @BeforeClass
  public void shouldDoSomethingElseBlah() {}

  @BeforeClass
  protected void protectedBefore() {}

  @BeforeClass
  void packageBefore() {}

  @BeforeClass
  public static void fine() {}

  @AfterClass
  public static void fineAfter() {}

  @SuppressWarnings("JUnit4ClassAnnotationNonStatic")
  @BeforeClass
  public void suppressed() {}

  @Before
  public void ok() {}
}

@RunWith(JUnit4.class)
class S10SetUp1 {
  public void setUp() {}
}

@RunWith(JUnit4.class)
class S10SetUp2 {
  protected void setUp() {}
}

@RunWith(JUnit4.class)
class S10AfterToBefore {
  @After
  protected void setUp() {}
}

@RunWith(JUnit4.class)
class S10AfterClassToBeforeClass {
  @AfterClass
  protected void setUp() {}
}

class S10BaseTestClass {
  void setUp() {}

  void tearDown() {}
}

@RunWith(JUnit4.class)
class S10Inherit extends S10BaseTestClass {
  protected void setUp() {}

  protected void tearDown() {}
}

@RunWith(JUnit4.class)
class S10OverriddenSetUp extends S10BaseTestClass {
  @Override
  protected void setUp() {}

  @Override
  public void tearDown() {}
}

class S10CustomBefore {
  @interface Before {}

  @interface After {}

  @RunWith(JUnit4.class)
  static class A {
    @Before
    public void setUp() {}

    @Before
    protected void initMocks() {}

    @After
    public void tearDown() {}

    @After
    protected void cleanup() {}
  }
}

class S10NotJunit4 {
  public void setUp() {}

  public void tearDown() {}
}

@RunWith(JUnit38ClassRunner.class)
class S10WrongRunner {
  public void setUp() {}

  public void tearDown() {}

  public void testFoo() {}
}

@RunWith(JUnit4.class)
class S10Correct {
  @Before
  public void setUp() {}

  @After
  public void tearDown() {}
}

@RunWith(JUnit4.class)
class S10JUnit3Too extends TestCase {
  public void setUp() {}

  public void tearDown() {}

  public void testFoo() {}
}

@RunWith(JUnit4.class)
class S10PrivateSetUp {
  private void setUp() {}

  private void tearDown() {}

  void packageLocal() {}

  int setUp(int x) {
    return 42;
  }

  public void setUp(boolean ignored) {}

  public static void tearDown(String s) {}
}

@RunWith(JUnit4.class)
class S10StaticSetUp {
  public static void setUp() {}

  public static void tearDown() {}
}

abstract class S10AnnotatedBase {
  @Before
  public void setUp() {}

  @After
  public void tearDown() {}
}

@RunWith(JUnit4.class)
class S10ExtendsAnnotated extends S10AnnotatedBase {
  public void setUp() {}

  public void tearDown() {}
}

@RunWith(JUnit4.class)
class S10Suppressed {
  @SuppressWarnings("JUnit4SetUpNotRun")
  public void setUp() {}

  @SuppressWarnings("JUnit4TearDownNotRun")
  public void tearDown() {}
}

@RunWith(JUnit4.class)
class S10BeforeToAfter {
  @Before
  protected void tearDown() {}
}

@RunWith(JUnit4.class)
class S10BeforeClassToAfterClass {
  @BeforeClass
  protected void tearDown() {}
}

@RunWith(JUnit4.class)
class S10TestAnnotated {
  @Test
  public void setUp() {}

  @Test
  public void tearDown() {}
}

class S10MethodTestsOnly {
  @Test
  public void real() {}

  public void setUp() {}

  public void tearDown() {}
}

abstract class S10AbstractSetUp {
  @Test
  public void real() {}

  public void setUp() {}

  public abstract void tearDown();
}

@RunWith(JUnit4.class)
class S10TestNotRun1 {
  public void testThisIsATest() {}

  public static void testThisIsAStaticTest() {}

  public void disabledTestDoSomething() {
    verify();
  }

  public void ignoredThing() {}

  void verify() {}
}

@RunWith(MockitoJUnitRunner.class)
class S10TestNotRun2 {
  public void testThisIsATest() {}

  public static void testThisIsAStaticTest() {}
}

@RunWith(JUnit4.class)
class S10TestNotRun3 {
  public void shouldDoSomething() {
    System.err.println();
  }

  public void givenFoo_thenBar() {}

  @Deprecated
  public void testShouldDoSomething() {}

  @Deprecated
  public void annotatedNotTest() {
    verify();
  }

  private static void assertDoesSomething() {}

  public static void staticNotTest() {
    assertDoesSomething();
  }

  public void helperCalledElsewhere() {
    verify();
  }

  public void helperViaReference() {}

  public void helperInLambda() {}

  public void notCalled() {}

  @Test
  public void testDoesSomething() {
    helperCalledElsewhere();
    Runnable r = this::helperViaReference;
    run(u -> helperInLambda());
  }

  void run(java.util.function.Consumer<Object> f) {}

  void verify() {}
}

@RunWith(JUnit4.class)
class S10TestNotRun4 {
  void testTest1() {}

  @Test
  public void testTest2() {}

  @Before
  public void testBefore() {}

  @After
  public void testAfter() {}

  @BeforeClass
  public void testBeforeClass() {}

  @AfterClass
  public void testAfterClass() {}

  public void testTest3(int foo) {}

  public int testSomething() {
    return 42;
  }

  @Ignore
  public void testIgnored() {}

  protected void testProtected() {}

  private void testPrivate() {}
}

@RunWith(JUnit4.class)
abstract class S10TestNotRunAbstract {
  public void testDoSomething() {}
}

@RunWith(JUnit4.class)
class S10TestNotRunJUnit3 extends TestCase {
  public void testThisIsATest() {}
}

@RunWith(JUnit38ClassRunner.class)
class S10TestNotRunWrongRunner {
  public void testThisIsATest() {}
}

class S10TestNotRunNoRunner {
  public void testThisIsATest() {}
}

class S10TestNotRunBase {
  @Test
  public void testOverrideThis() {}
}

@RunWith(JUnit4.class)
class S10TestNotRunSub extends S10TestNotRunBase {
  @Override
  public void testOverrideThis() {}
}

class S10TestNotRunTestsOnly {
  public void testDoesSomething() {}

  @Test
  public void foo() {}

  @SuppressWarnings("JUnit4TestNotRun")
  public void testSuppressed() {}
}

@SuppressWarnings("JUnit4TestNotRun")
@RunWith(JUnit4.class)
class S10TestNotRunSuppressedClass {
  public void testDoesSomething() {}
}

@RunWith(Theories.class)
class S10TestNotRunTheories {
  @Theory
  public void testMyTheory() {}

  public void testOther(@FromDataPoints("foo") Object foo) {}

  public void testNotInjectable(Object foo) {}

  public void testEnumParam(S10Color color) {}

  public void testBooleanParam(boolean b) {}

  public void testBoxedParam(Boolean b) {}
}

enum S10Color {
  RED
}

@RunWith(Enclosed.class)
final class S10Enclosed1 {
  @Test
  public void test() {}

  public void helper() {}

  @Test
  public void test2() {}
}

@RunWith(JUnit4.class)
final class S10NotEnclosed {
  @Test
  public void test() {}
}

@RunWith(Enclosed.class)
class S10Enclosed2 {
  @Test
  public void test() {}

  public class FooInnerTest extends S10Enclosed2 {}
}

@RunWith(Enclosed.class)
class S10Enclosed3 {
  public static class BarTest {
    @Test
    public void test() {}
  }
}

@RunWith(value = Enclosed.class)
class S10Enclosed4 {
  @Test
  public void test() {}
}

@RunWith(Enclosed.class)
class S10Enclosed5 {
  public void testJunit3Style() {}

  @Theory
  public void theory() {}

  @SuppressWarnings("JUnit4TestsNotRunWithinEnclosed")
  @Test
  public void suppressedTest() {}
}

@SuppressWarnings("JUnit4TestsNotRunWithinEnclosed")
@RunWith(Enclosed.class)
class S10Enclosed6 {
  @Test
  public void test() {}
}
