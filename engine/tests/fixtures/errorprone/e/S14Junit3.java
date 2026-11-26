package e;

import junit.framework.TestCase;
import org.junit.Ignore;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runner.Runner;

public class S14Junit3 extends TestCase {
  public static void tesNameStatic() {}

  public void tetsName() {}

  public void tesstName() {}

  public void tesetName() {}

  public void tesgName() {}

  public void textName() {}

  public void tesName1() {}

  public void ttestName2() {}

  public void teestName3() {}

  public void tstName4() {}

  public void tetName5() {}

  public void etstName6() {}

  public void tsetName7() {}

  public void teatName8() {}

  public void TestName9() {}

  public void TEST_NAME_10() {}

  public void tesname11() {}

  private void testDoesStuff() {}

  private void tsetDoesStuff2() {}

  private static void tsetDoesStuff3() throws Exception {}

  void tsetNoModifiers() {}

  protected void tsetProtected() {}

  public void testWithParameters(boolean param) {}

  public static void testStaticOk() {}

  @SuppressWarnings("JUnit3TestNotRun")
  public void testSuppressed(boolean param) {}

  public void test() {}

  public void testCorrectlySpelled() {}

  public void bestNameEver() {}

  public void destroy() {}

  public void restore() {}

  public void establish() {}

  public void estimate() {}

  public boolean teslaInventedLightbulb() {
    return true;
  }

  public void tesselate(float f) {}

  public void testActually() {
    calledElsewhere(true);
  }

  public void calledElsewhere(boolean param) {}

  public void testCalledViaThis() {
    this.tesCalledOnThis();
  }

  public void tesCalledOnThis() {}

  @Test
  public void testILikeAnnotations() {}

  @Test
  @Ignore
  public void ignoredTest2() {}

  @Ignore
  @Test
  public void ignoredTest() {}

  @Test
  public void annotatedOnly() {}

  public int tesReturnsInt() {
    return 1;
  }

  private int tesPrivateInt() {
    return 1;
  }

  public void tesVarargs(String... args) {}

  private static class TestCase {
    private void tesHelper() {}

    private void destroy() {}
  }
}

interface S14Junit3Foo {
  void testDoesStuff(boolean param);
}

class S14Junit3Override extends TestCase implements S14Junit3Foo {
  public void testDoesStuff(boolean param) {}
}

class S14Junit3Base extends TestCase {
  public void testDoesStuff(boolean param) {}
}

class S14Junit3Helper extends TestCase {
  public void helperBase(boolean param) {}

  public void tesBase() {}
}

@RunWith(Runner.class)
class S14Junit3Mixed extends TestCase {
  @Test
  public void name() {}

  public void tesMisspelled() {}

  @Test
  public void tesBothIssuesAtOnce() {}
}

abstract class S14Junit3Abstract extends TestCase {
  @Test
  public void name() {}

  public void tesMisspelled() {}
}

@RunWith(org.junit.runners.JUnit4.class)
class S14Junit4Class {
  @Test
  public void nameDoesNotStartWithTest() {}

  @Test
  public void tesName() {}

  public void tesNotAnnotated() {}
}

class S14Junit3Nested {
  static class Inner extends TestCase {
    public void tesInner() {}
  }

  void other() {
    new TestCase() {
      public void tesAnonymous() {}
    };
  }
}

class S14Junit3Subclass extends S14Junit3Parent {
  public void tesChild() {}
}

@RunWith(Runner.class)
class S14Junit3Parent extends TestCase {}

class S14Junit3Plain {
  public void tesPlain() {}
}

class S14Junit3Generic extends TestCase {
  public <T> void tesGeneric() {}

  /** doc */
  public final void tesFinal() {}

  @Deprecated
  void tesAnnotated() {}

  public synchronized void tesSync() {}

  static public void tesOldStyle() {}
}
