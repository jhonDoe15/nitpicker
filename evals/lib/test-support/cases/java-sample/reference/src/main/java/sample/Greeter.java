package sample;

import java.util.Locale;

public final class Greeter {
  public String greet(String name) {
    return "Hello, " + name + "!";
  }

  public String shout(String name) {
    return greet(name).toUpperCase(Locale.ROOT);
  }
}
