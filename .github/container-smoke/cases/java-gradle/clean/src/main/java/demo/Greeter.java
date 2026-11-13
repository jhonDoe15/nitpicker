package demo;

public final class Greeter {
  public String greet(String name) {
    return "Hello, " + name + "!";
  }

  public String shout(String name) {
    return name.trim().toUpperCase(java.util.Locale.ROOT);
  }

  /** Says goodbye. */
  public String farewell(String name) {
    return "Goodbye, " + name + ".";
  }
}
