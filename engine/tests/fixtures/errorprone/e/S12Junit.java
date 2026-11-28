package e;

import com.google.testing.junit.testparameterinjector.TestParameter;
import com.google.testing.junit.testparameterinjector.TestParameterInjector;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.junit.Test;
import org.junit.experimental.theories.Theories;
import org.junit.runner.RunWith;
import org.junit.runners.JUnit4;
import org.junit.runners.Parameterized;
import org.junit.runners.Parameterized.Parameter;
import org.junit.runners.Parameterized.Parameters;
import org.mockito.junit.MockitoJUnitRunner;

class S12Junit {
  @RunWith(JUnit4.class)
  public static class ParamsWithJUnit4 {
    @Parameter public int foo;
  }

  @RunWith(JUnit4.class)
  public static class ParamsMethodWithJUnit4 {
    @Parameters
    public static Object[] data() {
      return new Object[0];
    }
  }

  @RunWith(MockitoJUnitRunner.class)
  public static class ParamsWithMockito {
    @Parameter(1) public int bar;
  }

  @org.junit.runner.RunWith(org.junit.runners.JUnit4.class)
  public static class ParamsQualified {
    @org.junit.runners.Parameterized.Parameter public int foo;
  }

  @RunWith(Parameterized.class)
  public static class AlreadyParameterized {
    @Parameter public int foo;
  }

  @RunWith(JUnit4.class)
  public static class NoParameters {}

  @SuppressWarnings("ParametersButNotParameterized")
  @RunWith(JUnit4.class)
  public static class ParamsSuppressed {
    @Parameter public int foo;
  }

  public static class NoRunner {
    @Parameter public int foo;
  }

  @RunWith(JUnit4.class)
  public static class TestParamWithJUnit4 {
    @TestParameter public boolean foo;
  }

  @RunWith(Parameterized.class)
  public static class TestParamWithParameterized {
    @TestParameter public boolean foo;
  }

  @RunWith(Theories.class)
  public static class TestParamWithTheories {
    @TestParameter boolean foo;
  }

  @RunWith(TestParameterInjector.class)
  public static class TestParamInjected {
    @TestParameter public boolean foo;
  }

  @RunWith(MockitoJUnitRunner.class)
  public static class TestParamWithMockito {
    @TestParameter public boolean foo;
  }

  @RunWith(JUnit4.class)
  public static class TestParamNone {}

  @SuppressWarnings("TestParametersNotInitialized")
  @RunWith(JUnit4.class)
  public static class TestParamSuppressed {
    @TestParameter public boolean foo;
  }

  public static class ExceptionTest {
    @Test(expected = IOException.class, timeout = 0L)
    public void twoStatements() throws Exception {
      Path p = Paths.get("NOSUCH");
      Files.readAllBytes(p);
      Files.readAllBytes(p);
    }

    @Test(expected = IOException.class)
    public void marker() throws Exception {
      Path p = Paths.get("NOSUCH");
      Files.readAllBytes(p);
    }

    @Test(expected = IOException.class)
    public void oneStatement() throws Exception {
      Files.readAllBytes(Paths.get("NOSUCH"));
    }

    @org.junit.Test(expected = IOException.class)
    public void qualified() throws Exception {
      Files.readAllBytes(Paths.get("NOSUCH"));
    }

    @Test(timeout = 5L, expected = IOException.class)
    public void expectedLast() throws Exception {
      Files.readAllBytes(Paths.get("NOSUCH"));
    }

    @Test(timeout = 5L, expected = IOException.class)
    public void expectedLastTwo() throws Exception {
      Path p = Paths.get("NOSUCH");
      Files.readAllBytes(p);
    }

    @Test(expected = IllegalStateException.class)
    public void lastIsNotExpression() throws Exception {
      int x = 1;
      if (x > 0) {
        throw new IllegalStateException();
      }
    }

    @Test(expected = IllegalStateException.class)
    public void emptyBody() throws Exception {}

    @Test(expected = IllegalStateException.class)
    @SuppressWarnings("TestExceptionChecker")
    public void suppressed() throws Exception {
      Files.readAllBytes(Paths.get("NOSUCH"));
    }

    @Test(timeout = 5L)
    public void noExpected() throws Exception {
      Files.readAllBytes(Paths.get("NOSUCH"));
    }

    @Test
    public void plain() throws Exception {
      Files.readAllBytes(Paths.get("NOSUCH"));
    }

    public void notATest() throws Exception {
      Files.readAllBytes(Paths.get("NOSUCH"));
    }
  }

  interface Abstract {
    @Test(expected = IOException.class)
    void abstractMethod();
  }
}
