package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Locale;
import java.util.TimeZone;
import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.DefaultTimeZone;
import org.junitpioneer.jupiter.RestoreSystemProperties;

class GlobalStateTest {
  @Test
  void leaksAProperty() {
    System.setProperty("shop.currency", "EUR"); // violation: GlobalStateLeakInTest
    assertThat(System.getProperty("shop.currency")).isEqualTo("EUR");
  }

  @Test
  void leaksTheLocale() {
    Locale.setDefault(Locale.ROOT); // violation: GlobalStateLeakInTest
    assertThat(String.format("%,d", 1000)).isEqualTo("1,000");
  }

  @Test
  void leaksTheDiscount() {
    Prices.discountPercent = 10; // violation: GlobalStateLeakInTest
    Prices.setRounding(5); // violation: GlobalStateLeakInTest
    assertThat(Prices.discounted(100)).isEqualTo(90);
  }

  @Test
  void restoresInFinally() {
    String previous = System.getProperty("shop.region");
    System.setProperty("shop.region", "EU");
    try {
      assertThat(System.getProperty("shop.region")).isEqualTo("EU");
    } finally {
      if (previous == null) {
        System.clearProperty("shop.region");
      } else {
        System.setProperty("shop.region", previous);
      }
    }
  }

  @Test
  @RestoreSystemProperties
  void restoredByTheExtension() {
    System.setProperty("shop.channel", "web");
    assertThat(System.getProperty("shop.channel")).isEqualTo("web");
  }

  @Test
  @DefaultTimeZone("UTC")
  void zoneRestoredByTheExtension() {
    TimeZone.setDefault(TimeZone.getTimeZone("Europe/Paris"));
    assertThat(TimeZone.getDefault().getID()).isEqualTo("Europe/Paris");
  }
}
