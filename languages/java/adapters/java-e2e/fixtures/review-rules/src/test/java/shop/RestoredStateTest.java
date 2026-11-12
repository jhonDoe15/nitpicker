package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Locale;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RestoredStateTest {
  private Locale locale;

  @BeforeEach
  void saveTheLocale() {
    locale = Locale.getDefault();
  }

  @Test
  void discountsInGermany() {
    Locale.setDefault(Locale.GERMANY);
    Prices.discountPercent = 20;
    assertThat(Prices.discounted(100)).isEqualTo(80);
  }

  @AfterEach
  void restore() {
    Locale.setDefault(locale);
    resetPrices();
  }

  private void resetPrices() {
    Prices.discountPercent = 0;
  }
}
