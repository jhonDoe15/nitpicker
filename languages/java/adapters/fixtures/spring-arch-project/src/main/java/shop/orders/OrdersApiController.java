package shop.orders;

import java.util.List;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrdersApiController implements OrdersApi {
  @Override
  public List<Order> list() {
    return List.of();
  }
}
