package shop;

import lombok.Getter;

public class Price {
  /** The amount. */
  @Getter private int amount;

  public int twice() {
    int a = amount, b = amount;
    return a + b;
  }
}
