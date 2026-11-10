package shop;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class LegacyFloatTest {
  private final double total = 0.5 + 0.25;
  private final double one = 1.0;

  @Test
  public void comparesWithATolerance() {
    assertEquals(0.75, total, 1e-9);
    assertEquals("total", 0.75, total, 1e-9);
    assertNotEquals(0.5, total, 1e-9);
    assertEquals(1.0, one, 1e-9);
  }

  void comparesExactly() {
    assertEquals(0.75, total); // violation: FloatEqualityInTest
    assertEquals("total", -0.75, total); // violation: FloatEqualityInTest
    assertNotEquals(0.75f, total); // violation: FloatEqualityInTest
    assertTrue("total", total == 0.75); // violation: FloatEqualityInTest
    assertTrue(one == 1.0);
    assertEquals(1.0, one);
  }
}
