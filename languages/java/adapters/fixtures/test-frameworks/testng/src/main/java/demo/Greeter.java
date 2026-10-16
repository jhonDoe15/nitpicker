package demo;

import java.util.Objects;

public final class Greeter {
  public String greet(String name) {
    return "Hello, " + Objects.requireNonNull(name);
  }

  public String farewell(String name) {
    return "Goodbye, " + name;
  }
}
