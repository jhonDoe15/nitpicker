package shop.settings;

import static java.lang.System.getenv;

import java.util.Map;
import java.util.Optional;

public final class Checkout {
  private static final int BATCH = Integer.getInteger("shop.batch", 50); // violation: ConfigurationReadOutsideCompositionRoot

  public String region() {
    return System.getenv("SHOP_REGION"); // violation: ConfigurationReadOutsideCompositionRoot
  }

  public String mode() {
    return System.getProperty("shop.mode", "live"); // violation: ConfigurationReadOutsideCompositionRoot
  }

  public String currency() {
    return System.getenv().getOrDefault("SHOP_CURRENCY", "EUR"); // violation: ConfigurationReadOutsideCompositionRoot
  }

  public String token() {
    return getenv("SHOP_TOKEN"); // violation: ConfigurationReadOutsideCompositionRoot
  }

  public String named(String key) {
    return System.getProperty(key); // violation: ConfigurationReadOutsideCompositionRoot
  }

  public Optional<String> lookup(Optional<String> name) {
    return name.map(System::getenv); // violation: ConfigurationReadOutsideCompositionRoot
  }

  public long timeout() {
    return Long.getLong("shop.timeout", 30L); // violation: ConfigurationReadOutsideCompositionRoot
  }

  public boolean debug() {
    return Boolean.getBoolean("shop.debug"); // violation: ConfigurationReadOutsideCompositionRoot
  }

  public int batch() {
    return BATCH;
  }

  public String javaVersion() {
    return System.getProperty("java.version");
  }

  public String home() {
    return System.getProperty("user.home");
  }

  public String proxy() {
    return System.getProperty("https.proxyHost");
  }

  public Map<String, String> inherited() {
    return System.getenv();
  }
}
