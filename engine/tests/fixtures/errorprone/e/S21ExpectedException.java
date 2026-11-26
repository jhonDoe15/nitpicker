import static com.google.common.truth.Truth.assertThat;
import static org.junit.Assert.fail;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.hamcrest.CoreMatchers;
import org.hamcrest.Matcher;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.ExpectedException;

class S21ExpectedException {
  @Rule ExpectedException thrown = ExpectedException.none();

  @Test
  public void expect() throws Exception {
    if (true) {
      Path p = Paths.get("NOSUCH");
      thrown.expect(IOException.class);
      thrown.expect(CoreMatchers.is(CoreMatchers.instanceOf(IOException.class)));
      thrown.expectCause(CoreMatchers.is(CoreMatchers.instanceOf(IOException.class)));
      thrown.expectMessage("error");
      thrown.expectMessage(CoreMatchers.containsString("error"));
      Files.readAllBytes(p);
      assertThat(Files.exists(p)).isTrue();
    }
  }

  @Test
  public void noExceptionType() throws Exception {
    Path p = Paths.get("NOSUCH");
    thrown.expect(CoreMatchers.is(CoreMatchers.instanceOf(IOException.class)));
    Files.readAllBytes(p);
  }

  @Test
  public void noExpectations() throws Exception {
    Path p = Paths.get("NOSUCH");
    Files.readAllBytes(p);
  }

  @Test
  public void nonExpressionStatement() throws Exception {
    Path p = Paths.get("NOSUCH");
    thrown.expect(IOException.class);
    Files.readAllBytes(p);
    if (true) Files.readAllBytes(p);
  }

  @Test
  public void isA() throws Exception {
    Path p = Paths.get("NOSUCH");
    thrown.expect(IOException.class);
    thrown.expectCause(CoreMatchers.isA(IOException.class));
    thrown.expectCause(org.hamcrest.core.Is.isA(IOException.class));
    Files.readAllBytes(p);
  }

  @Test
  public void typedMatcher() throws Exception {
    Path p = Paths.get("NOSUCH");
    Matcher<IOException> matcher = CoreMatchers.isA(IOException.class);
    thrown.expect(matcher);
    Files.readAllBytes(p);
  }

  @Test
  public void nothingButAsserts() throws Exception {
    thrown.expect(RuntimeException.class);
    assertThat(false).isTrue();
    assertThat(true).isTrue();
  }

  @Test
  public void testThrow() throws Exception {
    thrown.expect(IOException.class);
    throw new IOException();
  }

  @Test
  public void one() throws Exception {
    Path p = Paths.get("NOSUCH");
    thrown.expect(IOException.class);
    Files.readAllBytes(p);
    assertThat(Files.exists(p)).isTrue();
    fail();
  }

  @Test
  public void two() throws Exception {
    Path p = Paths.get("NOSUCH");
    thrown.expect(IOException.class);
    Files.readAllBytes(p);
    assertThat(Files.exists(p)).isTrue();
    throw new AssertionError();
  }

  @Test
  public void wildcardClass(Class<? extends Throwable> clazz) throws Exception {
    thrown.expect(clazz);
    clazz.toString();
  }

  @Test
  public void exactClass(Class<IOException> clazz) throws Exception {
    thrown.expect(clazz);
    clazz.toString();
  }

  @Test
  public void twoBlocks() throws Exception {
    thrown.expect(IOException.class);
    Runnable r =
        () -> {
          thrown.expectMessage("x");
          System.err.println();
        };
  }

  @Test
  public void expectedAtEnd() throws Exception {
    thrown.expect(IOException.class);
    thrown.expectMessage("a");
  }

  @Test
  @SuppressWarnings("ExpectedExceptionChecker")
  public void suppressed() throws Exception {
    thrown.expect(IOException.class);
    Files.readAllBytes(Paths.get("x"));
  }
}
