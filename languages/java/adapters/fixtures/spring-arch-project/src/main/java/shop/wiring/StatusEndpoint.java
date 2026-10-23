package shop.wiring;

import shop.carts.CartController;

public class StatusEndpoint implements Endpoint {
  private final Class<CartController> link = CartController.class;
  private final AuditStore store;

  public StatusEndpoint(AuditStore store) {
    this.store = store;
  }
}
