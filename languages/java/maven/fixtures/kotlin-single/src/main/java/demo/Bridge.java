package demo;

public final class Bridge {
  public String hello() {
    return new Greeter().greet("Java");
  }
}
