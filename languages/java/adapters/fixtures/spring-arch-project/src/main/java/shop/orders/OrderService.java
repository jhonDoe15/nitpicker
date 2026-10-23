package shop.orders;

import org.springframework.stereotype.Service;

@Service
public class OrderService {
  private final OrderRepository repository;

  public OrderService(OrderRepository repository) {
    this.repository = repository;
  }

  public OrderDto find(Long id) {
    return new OrderDto(repository.findOne(id).id());
  }
}
