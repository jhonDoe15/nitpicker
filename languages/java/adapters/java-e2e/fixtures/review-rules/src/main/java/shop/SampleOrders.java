package shop;

import java.util.List;

public final class SampleOrders {
  private SampleOrders() {}

  public static List<Long> cents() {
    return List.of(100L, 250L);
  }
}
