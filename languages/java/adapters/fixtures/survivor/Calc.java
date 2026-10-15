package demo;

public final class Calc {
  private static final int LIMIT = 10;

  public int clamp(int value) {
    return value > LIMIT ? LIMIT : value;
  }
}
