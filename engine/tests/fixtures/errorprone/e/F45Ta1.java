package e;

import static com.google.common.truth.Truth.assertThat;
import static com.google.common.truth.Truth.assertWithMessage;

import java.util.List;
import java.util.Map;

class F45Ta1 {
  static final int CONSTANT_EXPECTED = 3;

  static class Holder {
    Object value() { return null; }
    static Holder make() { return null; }
  }

  void f(Object actual, Object expected, List<String> expectedList, List<String> actualList, String[] actualArray,
      Map<String, Integer> expectedMap, Map<String, Integer> actualMap, Double expectedDouble, double actualDouble,
      float actualFloat, Holder expectedHolder, Object actualExpected, RuntimeException expectedException,
      Object expectedActual, Object other) {
    assertThat(expected).isEqualTo(actual);
    assertThat(expected).isNotEqualTo(actual);
    assertThat(actual).isEqualTo(expected);
    assertThat(expected).isEqualTo(expected);
    assertThat(expected).isEqualTo(actualExpected);
    assertThat(expected).isEqualTo(null);
    assertThat(expected).isEqualTo(3);
    assertThat(expected).isEqualTo(CONSTANT_EXPECTED);
    assertThat(expected).isEqualTo(Holder.make());
    assertThat(expected).isEqualTo(List.of(1, 2));
    assertThat(expected).isEqualTo(new Object());
    assertThat(expectedList).containsExactlyElementsIn(actualList);
    assertThat(expectedList).containsExactlyElementsIn(actualArray);
    assertThat(expectedMap).containsExactlyEntriesIn(actualMap);
    assertThat(expectedDouble).isWithin(0.1).of(actualDouble);
    assertThat(expectedDouble).isWithin(0.1).of(actualFloat);
    assertThat(expectedHolder.value()).isEqualTo(actual);
    assertThat(expectedException).isEqualTo(actual);
    assertThat(expectedActual).isEqualTo(actual);
    assertWithMessage("m").that(expected).isEqualTo(actual);
    assertThat(expected).isSameInstanceAs(actual);
    assertThat(
        expected).isEqualTo(other);
    assertThat(expected).isEqualTo(other.toString());
  }
}
