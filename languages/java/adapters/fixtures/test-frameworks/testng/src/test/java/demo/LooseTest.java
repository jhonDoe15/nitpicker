package demo;

import org.testng.annotations.Test;

public class LooseTest {
  @Test
  public void runsWithoutChecking() {
    new Greeter().greet("Ada");
  }
}
