package shop.reports;

import java.util.List;
import shop.orders.Order;
import shop.orders.OrderRepository;

public class JavaImports {
  private final OrderRepository repository;

  public JavaImports(OrderRepository repository) {
    this.repository = repository;
  }

  public void saveEach(List<Order> orders) {
    for (Order order : orders) {
      repository.save(order);
    }
  }
}
