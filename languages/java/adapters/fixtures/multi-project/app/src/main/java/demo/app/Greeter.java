package demo.app;

public final class Greeter {
  private Greeter() {}

  public static String greet(String name) {
    Settings settings = new Settings().name(name);
    settings.enabled(true);
    return settings.matches(settings.name()) ? "Hello" : "Hello, " + settings.name();
  }
}
