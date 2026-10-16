package demo.lib;

public final class Counter {
  private int unused;

  @GeneratedValue
  public int id() {
    return 1;
  }

  public int next(int value) {
    return value + 1;
  }
}
