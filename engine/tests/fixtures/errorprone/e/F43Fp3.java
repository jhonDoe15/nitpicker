

import static com.google.common.truth.Truth.assertThat;
import static org.junit.Assert.assertEquals;

/**
 * Positive test cases for FloatingPointAssertionWithinEpsilon check.
 *
 * @author ghm@google.com (Graeme Morgan)
 */
final class F43Fp3 {

  private static final float TOLERANCE = 1e-10f;
  private static final double TOLERANCE2 = 1e-20f;
  private static final float VALUE = 1;

  public void testFloat() {
    assertThat(1.0f).isWithin(1e-20f).of(1.0f);
    assertThat(1f).isWithin(TOLERANCE).of(VALUE);
    assertThat(1e10f).isWithin(1).of(1e10f);
    assertThat(1f).isNotWithin(1e-10f).of(2);
    assertEquals(1f, 1f, TOLERANCE);
    assertEquals("equal!", 1f, 1f, TOLERANCE);
  }

  public void testDouble() {
    assertThat(1.0).isWithin(1e-20).of(1.0);
    assertThat(1.0).isWithin(TOLERANCE2).of(1.0f);
    assertThat(1.0).isWithin(TOLERANCE2).of(1);
    assertThat(1e20).isWithin(1).of(1e20);
    assertThat(0.1).isNotWithin(TOLERANCE2).of(0.1f);
    assertEquals(1.0, 1.0, TOLERANCE2);
    assertEquals("equal!", 1.0, 1.0, TOLERANCE2);
  }
}
