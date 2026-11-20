package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ResetBeforeEachTest {
  static final List<String> seen = new ArrayList<>();
  static final List<String> kept = new ArrayList<>();

  @BeforeEach
  void reset() {
    seen.clear();
    Prices.discountPercent = 0;
  }

  @Test
  void recordsTheSale() {
    seen.add("sale");
    kept.add("sale"); // violation: SharedTestState
    Prices.setExact();
    assertThat(seen).containsExactly("sale");
  }

  @Test
  void leaksTheRounding() {
    Prices.setRounding(5); // violation: GlobalStateLeakInTest
    assertThat(Prices.discounted(104)).isEqualTo(100);
  }
}

class PreparedStateTest {
  @BeforeEach
  void prepare() {
    Prices.discountPercent = Integer.parseInt("10"); // violation: GlobalStateLeakInTest
  }

  @Test
  void discounts() {
    assertThat(Prices.discounted(100)).isEqualTo(90);
  }
}

final class ZoneChild {
  private ZoneChild() {}

  public static void main(String[] args) {
    TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    assertThat(TimeZone.getDefault().getID()).isEqualTo("UTC");
  }
}
