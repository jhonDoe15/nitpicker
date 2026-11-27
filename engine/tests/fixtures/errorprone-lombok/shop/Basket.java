package shop;

import lombok.NonNull;
import lombok.Synchronized;

public class Basket {
  private int count;

  public Basket(@NonNull String owner) {
    this.count = owner.length();
  }

  @Synchronized
  public void add() {
    count++;
  }
}
