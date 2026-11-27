

import static com.google.common.truth.Truth.assertThat;
import static org.junit.Assert.assertEquals;

/**
 * Negative test cases for FloatingPointAssertionWithinEpsilon check.
 *
 * @author ghm@google.com (Graeme Morgan)
 */
final class F43Fp2 {

  private static final float TOLERANCE = 1e-5f;
  private static final double TOLERANCE2 = 1e-10f;
  private static final float VALUE = 1;

  public void testFloat() {
    String test = Boolean.TRUE.toString();
    assertThat(1.0f).isWithin(1e-5f).of(1.0f);
    assertThat(1f).isWithin(TOLERANCE).of(VALUE);
    assertThat(1f).isWithin(1).of(1);

    assertThat(1f).isNotWithin(0).of(2f);

    assertThat(1f).isNotWithin(.5f).of(2f);

    assertEquals(1f, 1f, TOLERANCE);
  }

  public void testDouble() {
    String test = Boolean.TRUE.toString();
    assertThat(1.0).isWithin(1e-10).of(1.0);
    assertThat(1.0).isWithin(TOLERANCE2).of(1f);
    assertThat(1.0).isWithin(TOLERANCE2).of(1);

    assertEquals(1.0, 1.0, TOLERANCE);
  }

  public void testZeroCases() {
    assertThat(1.0).isWithin(0.0).of(1.0);
    assertThat(1f).isWithin(0f).of(1f);
    assertThat(1f).isWithin(0).of(1f);

    assertEquals(1f, 1f, 0f);
  }
}
