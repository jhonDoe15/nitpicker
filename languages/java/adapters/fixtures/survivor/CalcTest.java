package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CalcTest {
  @Test
  void clampsAboveTen() {
    assertEquals(10, new Calc().clamp(20));
    assertEquals(5, new Calc().clamp(5));
  }
}
