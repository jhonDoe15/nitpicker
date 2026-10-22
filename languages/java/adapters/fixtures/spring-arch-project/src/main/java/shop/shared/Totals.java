package shop.shared;

import shop.orders.OrderDto;

public final class Totals {
  private Totals() {}

  public static Long of(OrderDto order) {
    return order.id();
  }
}
