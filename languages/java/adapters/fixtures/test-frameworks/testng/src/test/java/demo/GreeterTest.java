package demo;

import static org.testng.Assert.assertEquals;

import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

public class GreeterTest {
  @DataProvider(name = "names")
  public Object[][] names() {
    return new Object[][] {{"Ada"}, {"Grace"}};
  }

  @Test(dataProvider = "names")
  public void greets(String name) {
    assertEquals(new Greeter().greet(name), "Hello, " + name);
  }

  @Test
  public void saysGoodbye() {
    assertEquals(new Greeter().farewell("Ada"), "Goodbye, Ada");
  }
}
