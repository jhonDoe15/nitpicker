package shop;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertTrue;

import org.testng.annotations.Test;

public class TestngFloatTest {
  private final double total = 0.5 + 0.25;
  private final double one = 1.0;

  @Test
  public void comparesExactly() {
    assertEquals(total, 0.75); // violation: FloatEqualityInTest
    assertEquals(total, 0.75, "total"); // violation: FloatEqualityInTest
    assertNotEquals(total, -0.75); // violation: FloatEqualityInTest
    assertTrue(total == 0.75); // violation: FloatEqualityInTest
    assertFalse(total != 0.75, "total"); // violation: FloatEqualityInTest
    assertTrue(one == 1.0);
  }

  @Test
  public void comparesWithATolerance() {
    assertEquals(total, 0.75, 1e-9);
    assertEquals(total, 0.75, 1e-9, "total");
    assertNotEquals(total, 0.5, 1e-9);
    assertEquals(one, 1.0);
  }
}
