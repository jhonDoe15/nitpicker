package demo;

import org.testng.annotations.Test;

public class NgTests {
  @Test(retryAnalyzer = Object.class, description = "keeps this")
  public void flaky() {}

  @Test
  public void steady() {}
}
