import static com.google.common.truth.Truth.assertThat;

import java.io.IOError;
import java.io.IOException;
import org.junit.Assert;

class S21AssertionFailure {
  void positive() {
    try {
      Assert.fail();
    } catch (Throwable t) {
    }
    try {
      Assert.fail();
    } catch (AssertionError t) {
    }
    try {
      if (true) throw new NoSuchFieldException();
      if (true) throw new NoSuchMethodException();
      Assert.fail();
    } catch (NoSuchFieldException | NoSuchMethodException | AssertionError t) {
      System.err.println(t);
    }
    AssertionError e = new AssertionError();
    try {
      Assert.fail();
    } catch (AssertionError t) {
      throw e;
    }
    try {
      Assert.fail();
    } catch (AssertionError t) {
      throw new AssertionError(e);
    }
    try {
      Assert.assertTrue(true);
    } catch (AssertionError t) {
    }
    try {
      junit.framework.Assert.fail("x");
    } catch (final AssertionError t) {
      System.err.println(t);
    }
  }

  void negative() {
    try {
      if (true) throw new IOException();
      Assert.fail();
    } catch (IOException t) {
    }
    try {
      Assert.fail();
    } catch (Exception t) {
    }
    try {
    } catch (Throwable t) {
      Assert.fail();
    }
    try {
      Assert.fail();
    } catch (AssertionError t) {
      throw t;
    }
    try {
      Assert.fail();
    } catch (AssertionError t) {
      throw new AssertionError(t);
    }
    try {
      Runnable r = () -> Assert.fail();
    } catch (AssertionError t) {
    }
    try {
      Assert.fail();
    } catch (NullPointerException | IOError t) {
      System.err.println(t);
    }
  }

  void refactoring() {
    try {
      System.err.println();
      Assert.fail();
    } catch (AssertionError t) {
      assertThat(t).isNotEqualTo("x");
    }
    try {
      System.err.println();
      Assert.fail();
    } catch (AssertionError e2) {
    }
    try {
      if (true) throw new IOException();
      Assert.fail();
    } catch (AssertionError e3) {
    } catch (Exception e3) {
    }
    try {
      if (true) throw new NoSuchFieldException();
      Assert.fail();
    } catch (AssertionError | NoSuchFieldException e4) {
      System.err.println(e4);
    }
    try {
      System.err.println();
      System.err.println();
      Assert.fail();
    } catch (AssertionError t) {
      assertThat(t).isNotEqualTo("x");
    }
    try {
      System.err.println();
      System.err.println();
      Assert.fail();
    } catch (AssertionError e5) {
    }
    try {
      if (true) throw new AssertionError();
      Assert.fail();
    } catch (AssertionError e6) {
    }
    try {
      int a = 1, b = 2;
      Assert.fail();
    } catch (AssertionError e7) {
    }
    try {
      Assert.fail();
    } catch (AssertionError e8) {
      System.err.println(e8);
    } finally {
      System.err.println();
    }
  }

  @SuppressWarnings("AssertionFailureIgnored")
  void suppressed() {
    try {
      Assert.fail();
    } catch (AssertionError t) {
    }
  }
}
