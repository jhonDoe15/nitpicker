package shop.settings;

public final class Limits {
  private Limits() {}

  public static int batch() {
    return Integer.getInteger("shop.batch", 50); // violation: ConfigurationReadOutsideCompositionRoot
  }

  public static String region() {
    return System.getenv("SHOP_REGION");
  }
}
