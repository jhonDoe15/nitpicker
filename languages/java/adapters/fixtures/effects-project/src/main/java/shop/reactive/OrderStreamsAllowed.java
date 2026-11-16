package shop.reactive;

import java.util.List;
import reactor.core.publisher.Flux;
import shop.orders.Order;

public class OrderStreamsAllowed {
  private final ReactiveOrders orders;

  public OrderStreamsAllowed(ReactiveOrders orders) {
    this.orders = orders;
  }

  public Flux<Order> batched(List<Long> ids) {
    return orders.findAllById(ids);
  }

  public Flux<String> withoutLookup(List<Long> ids) {
    return Flux.fromIterable(ids).map(id -> "order-" + id);
  }

  public Flux<Order> fromDatabase() {
    return orders.findAll().map(order -> order);
  }
}
