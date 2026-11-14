package demo;

import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.RetryingTest;

public class Tests {
  @Test
  public void works() {}

  public void forgotten() {}

  void helper() {}

  @RetryingTest(5)
  public void flaky() {}
}
