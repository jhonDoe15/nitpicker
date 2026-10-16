package demo;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.Collection;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;

@RunWith(Parameterized.class)
public class GreeterTest {
  @Parameterized.Parameters(name = "{0}")
  public static Collection<Object[]> names() {
    return Arrays.asList(new Object[][] {{"Ada"}, {"Grace"}});
  }

  private final String name;

  public GreeterTest(String name) {
    this.name = name;
  }

  @Test
  public void greets() {
    assertEquals("Hello, " + name, new Greeter().greet(name));
  }

  @Test
  public void saysGoodbye() {
    assertEquals("Goodbye, " + name, new Greeter().farewell(name));
  }
}
