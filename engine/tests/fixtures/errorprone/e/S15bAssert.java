package e;

import static com.google.common.truth.Truth.assertThat;
import static com.google.common.truth.Truth.assertWithMessage;

import com.google.common.truth.TestVerb;
import java.time.Duration;
import java.util.List;
import org.junit.Assert;

abstract class S15bAssert extends junit.framework.TestCase {
  private int field;
  private final String name = "n";
  static final String CONSTANT = "c";

  void truth(String test, List<String> xs, int x, TestVerb verb) {
    assertThat(test).isEqualTo(test);
    assertWithMessage("msg").that(test).isEqualTo(test);
    assertThat(test).isSameInstanceAs(test);
    assertWithMessage("msg").that(test).isSameInstanceAs(test);
    assertThat(test).isNotEqualTo(test);
    assertThat(test).isNotSameInstanceAs(test);
    assertWithMessage("msg").that(test).isNotEqualTo(test);
    assertWithMessage("msg").that(test).isNotSameInstanceAs(test);
    assertThat(xs).containsExactlyElementsIn(xs);
    assertThat(xs).containsAtLeastElementsIn(xs);
    verb.that(test).isEqualTo(test);
    x = 2;
    assertThat(x).isEqualTo(x);
    assertThat(Duration.ofMillis(x)).isEqualTo(Duration.ofMillis(x));
    assertThat(this.field).isEqualTo(field);
    assertThat(field).isEqualTo(this.field);
    assertThat(name).isEqualTo(this.name);
    assertThat(CONSTANT).isEqualTo(S15bAssert.CONSTANT);
    assertThat(1).isEqualTo(1);
    assertThat("a").isEqualTo("a");
    assertThat(test == null).isEqualTo(test == null);
    assertThat(test.length()).isEqualTo(test.length());
    assertThat(test.trim()).isEqualTo(test.trim());
    assertThat((test)).isEqualTo(test);
    assertThat(xs.size()).isEqualTo(xs.size());
  }

  void truthNegative(String test, String other, List<String> xs, int x, int y) {
    assertThat(test).isEqualTo(other);
    assertThat(Boolean.TRUE.toString()).isNotEqualTo(Boolean.FALSE.toString());
    assertThat(Duration.ofMillis(x)).isEqualTo(Duration.ofMillis(y));
    assertThat(1).isEqualTo(2);
    assertThat(1).isEqualTo(1L);
    assertThat(xs).containsExactlyElementsIn(List.of(test));
    assertThat(test).isTrue();
  }

  void junit(int x, String s, Object[] a) {
    Assert.assertEquals(x, x);
    Assert.assertEquals("foo", x, x);
    Assert.assertNotEquals(x, x);
    Assert.assertNotEquals("foo", x, x);
    Assert.assertArrayEquals(a, a);
    Assert.assertEquals(s, s);
    Assert.assertEquals(s, s, s);
    Assert.assertEquals(s, "a", s);
    junit.framework.Assert.assertEquals(x, x);
    assertEquals(x, x);
    assertEquals("m", s, s);
    assertEquals(x, s);
    assertEquals(1, 1);
    Assert.assertEquals(1, 1L);
  }

  @SuppressWarnings("SelfAssertion")
  void suppressed(String test) {
    assertThat(test).isEqualTo(test);
  }
}
