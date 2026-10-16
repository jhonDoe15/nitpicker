package demo;

import org.junit.Test;

public class LooseTest {
  @Test
  public void runsWithoutChecking() {
    new Greeter().greet("Ada");
  }
}
