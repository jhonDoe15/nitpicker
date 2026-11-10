package shop.settings;

import jakarta.enterprise.inject.Produces;

public final class Producers {
  @Produces
  String region() {
    return System.getenv("SHOP_REGION");
  }

  String mode() {
    return System.getenv("SHOP_MODE"); // violation: ConfigurationReadOutsideCompositionRoot
  }
}
