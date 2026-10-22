package shop.orders;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrderController {
  private final OrderService service;
  private final OrderRepository repository;

  public OrderController(OrderService service, OrderRepository repository) {
    this.service = service;
    this.repository = repository;
  }

  @GetMapping("/orders/{id}")
  public OrderDto find(@PathVariable Long id) {
    return service.find(id);
  }

  @GetMapping("/orders")
  public List<Order> all() {
    return List.of(repository.findOne(1L));
  }

  @PostMapping("/orders")
  public OrderDto create(@RequestBody Order order) {
    return new OrderDto(order.id());
  }

  Order helper() {
    return repository.findOne(2L);
  }
}
