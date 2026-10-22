package demo;

import static org.testng.Assert.assertEquals;

import org.testng.annotations.Test;

public class CalcTest {
  @Test
  public void doublesTheValue() {
    assertEquals(new Calc().twice(3), 6);
  }
}
