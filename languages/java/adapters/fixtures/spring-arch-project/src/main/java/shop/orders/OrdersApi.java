package shop.orders;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;

public interface OrdersApi {
  @GetMapping("/api/orders")
  List<Order> list();
}
