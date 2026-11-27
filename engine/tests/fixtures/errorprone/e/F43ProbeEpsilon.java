import static com.google.common.truth.Truth.assertThat;
import static org.junit.Assert.assertEquals;

class F43ProbeEpsilon {
  static final long BIG = 123456789012345L;
  static final double TINY = Double.MIN_VALUE;

  void f(double d, Double boxed, int i, long l) {
    assertEquals(1e300, 1e300, 1e200);
    assertEquals(0.0, 0.0, TINY);
    assertEquals(1, 1, 1e-17);
    assertEquals(BIG, BIG, 0.001);
    assertEquals(Double.MAX_VALUE, Double.MAX_VALUE, 1);
    assertEquals(Double.NaN, 1.0, 1e-30);
    assertEquals(Double.POSITIVE_INFINITY, 1.0, 1e-30);
    assertEquals(1e-310, 1e-310, TINY);
    assertEquals(BIG, BIG, 0.001f);
    assertEquals("m", 1e5f, 1e5f, 1e-4f);
    assertEquals(9.5, 9.5, 1e-16);
    assertEquals(0.0001, 0.0001, 1e-21);
    assertEquals(99.0, 99.0, 1e-15);
    assertThat(1.0).isWithin(1e-20).of(1);
    assertThat(1.0).isWithin(1e-20).of(-1);
    assertThat(1.0).isWithin(1e-20).of(1L);
    assertThat(1.0).isWithin(1e-20).of(1_000);
    assertThat(1.0).isWithin(1e-20).of(0x10);
    assertThat(1.0).isWithin(1e-20).of(1.0f);
    assertThat(1.0).isNotWithin(1e-20).of(i + 1);
    assertThat(1.0f).isWithin(1e-20f).of(1);
    assertThat(1.0f).isWithin(1e-20f).of(2L);
    assertThat(1.0f).isWithin(0).of(1f);
    assertThat(1.0f).isWithin(1e-20f).of('a');
    assertThat(d).isWithin(1e-20).of(1.0e0);
    assertThat(d).isWithin(1e-20).of(1.0D);
  }
}
