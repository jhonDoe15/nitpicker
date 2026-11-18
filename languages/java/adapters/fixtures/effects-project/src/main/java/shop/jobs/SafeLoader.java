package shop.jobs;

import shop.orders.OrderLoader;

public class SafeLoader {
  private final OrderLoader loader;

  public SafeLoader(OrderLoader loader) {
    this.loader = loader;
  }

  public boolean load(Long id) {
    try {
      loader.load(id);
      return true;
    } catch (RuntimeException failed) {
      return false;
    }
  }
}
