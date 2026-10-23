package shop.carts;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import shop.catalog.internal.CatalogRepository;
import shop.orders.OrderController;

@RestController
public class CartController {
  private final CartService service;
  private final OrderController orders;
  private final CatalogRepository catalog;

  public CartController(CartService service, OrderController orders, CatalogRepository catalog) {
    this.service = service;
    this.orders = orders;
    this.catalog = catalog;
  }

  @GetMapping("/carts/link")
  public String link() {
    return OrderController.class.getSimpleName();
  }
}
