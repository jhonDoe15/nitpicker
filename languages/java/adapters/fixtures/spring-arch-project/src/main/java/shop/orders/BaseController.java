package shop.orders;

import org.springframework.web.bind.annotation.GetMapping;

public abstract class BaseController {
  @GetMapping("/base")
  public Order base() {
    return new Order();
  }
}
