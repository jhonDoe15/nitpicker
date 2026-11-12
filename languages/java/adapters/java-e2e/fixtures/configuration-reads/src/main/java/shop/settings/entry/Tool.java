package shop.settings.entry;

public final class Tool {
  void main() {}

  String region() {
    return System.getenv("SHOP_REGION"); // violation: ConfigurationReadOutsideCompositionRoot
  }
}
