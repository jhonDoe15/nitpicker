package e;

import static com.google.common.truth.Truth.assertThat;

class F45Ta2 {
  void classLiteral(Class<?> expectedType) {
    assertThat(expectedType).isEqualTo(String.class);
  }
}
