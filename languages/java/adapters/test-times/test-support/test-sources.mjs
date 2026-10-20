export const ADDS_SPEC = `package shop

class AddsSpec extends Specification {
  def "adds #a and #b"() {
    expect:
    a + b == c

    where:
    a | b | c
    1 | 2 | 3
  }

  def "max"() {
    expect:
    Math.max(a, b) == c

    where:
    a | b | c
    1 | 2 | 2
  }

  def helper(x) {
    x
  }
}
`;

export const ORDER_SOURCE = `package shop;

class OrderTest {
  @Test
  void totals() {
    assertEquals(3, total());
  }

  @ParameterizedTest
  @ValueSource(ints = {1, 2})
  void positive(int value) {
    assertTrue(value > 0);
  }
}
`;
