package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class FloatEqualityTest {
  private final double total = 0.5 + 0.25;
  private final Double boxed = total;
  private final float ratio = 0.5f;
  private final double one = 1.0;
  private final double thousands = 2e3;
  private final float three = 3.0f;

  @Test
  void comparesExactly() {
    assertEquals(0.75, total); // violation: FloatEqualityInTest
    assertNotEquals(total, -0.75); // violation: FloatEqualityInTest
    assertEquals(0.5f, ratio); // violation: FloatEqualityInTest
    assertEquals(0.75, total, "total"); // violation: FloatEqualityInTest
    assertEquals(7.5e-1, total, () -> "total"); // violation: FloatEqualityInTest
    assertEquals(0.75, boxed); // violation: FloatEqualityInTest
    assertNotEquals(.25, total); // violation: FloatEqualityInTest
    assertThat(total).isEqualTo(0.75); // violation: FloatEqualityInTest
    assertThat(boxed).as("boxed").isNotEqualTo(-0.75); // violation: FloatEqualityInTest
    assertThat(ratio).isEqualTo(0.5f); // violation: FloatEqualityInTest
    org.hamcrest.MatcherAssert.assertThat(total, is(0.75)); // violation: FloatEqualityInTest
    org.hamcrest.MatcherAssert.assertThat("total", total, equalTo(0.75)); // violation: FloatEqualityInTest
    assertTrue(total == 0.75); // violation: FloatEqualityInTest
    assertFalse(total != 0.75, "total"); // violation: FloatEqualityInTest
    assertTrue(-0.75 != total); // violation: FloatEqualityInTest
    assertTrue(Double.compare(total, 0.75) == 0); // violation: FloatEqualityInTest
    assertThat(total == 0.75).isTrue(); // violation: FloatEqualityInTest
    assertThat(total != 0.75).as("total").isFalse(); // violation: FloatEqualityInTest
  }

  @Test
  void comparesWithATolerance() {
    assertEquals(0.75, total, 1e-9);
    assertEquals(0.75, total, 1e-9, "total");
    assertEquals(0.5f, ratio, 1e-6f);
    assertNotEquals(0.5, total, 1e-9);
    assertThat(total).isCloseTo(0.75, within(1e-9));
    assertThat(total).isEqualTo(0.75, within(1e-9));
    org.hamcrest.MatcherAssert.assertThat(total, closeTo(0.75, 1e-9));
  }

  @Test
  void comparesWhatIsExact() {
    assertEquals(1.0, one);
    assertEquals(2e3, thousands);
    assertEquals(3.0f, three);
    assertEquals(4, Status.values().length);
    assertThat(one).isEqualTo(1.0);
    assertThat(total).isGreaterThan(0.5);
    assertThat(total).isLessThanOrEqualTo(0.75);
    assertThat(Status.NEW.name()).isEqualTo("NEW");
    assertTrue(Math.abs(total - 0.75) < 1e-9);
    assertTrue(total < 1.0);
    assertTrue(one == 1.0);
    assertFalse(thousands != 2e3);
    assertTrue(Double.compare(total, one) < 0);
    assertThat(total > 0.5).isTrue();
    assertThat(one == 1.0).isTrue();
    org.hamcrest.MatcherAssert.assertThat(one, is(1.0));
    assertEquals("0.75", String.valueOf(total));
  }
}
