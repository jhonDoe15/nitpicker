package a;

public class Base {
  private final String label;

  public Base(String label) {
    this.label = label;
  }

  public String hello() {
    return "hello " + label;
  }
}
