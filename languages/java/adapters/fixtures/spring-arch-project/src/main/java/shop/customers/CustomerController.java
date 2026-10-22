package shop.customers;

import shop.orders.OrderRepository;
import org.springframework.stereotype.Controller;

@Controller
public class CustomerController {
  static final class Lookup {
    private final OrderRepository repository;

    Lookup(OrderRepository repository) {
      this.repository = repository;
    }

    Object first() {
      return repository.findOne(1L);
    }
  }
}
