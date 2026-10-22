package demo;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class CalcTest {
  @Test
  public void doublesTheValue() {
    assertEquals(6, new Calc().twice(3));
  }
}
