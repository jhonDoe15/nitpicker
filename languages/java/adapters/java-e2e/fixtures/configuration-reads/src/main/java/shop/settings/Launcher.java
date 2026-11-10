package shop.settings;

public final class Launcher {
  private Launcher() {}

  public static void main(String[] args) {
    Settings settings = read();
    new Server(settings).start();
  }

  private static Settings read() {
    return new Settings(
        System.getenv("SHOP_REGION"), Integer.getInteger("shop.port", 8080), Boolean.getBoolean("shop.debug"));
  }

  record Settings(String region, int port, boolean debug) {}

  record Server(Settings settings) {
    void start() {}
  }
}
