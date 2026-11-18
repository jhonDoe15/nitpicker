package shop.reactive;

import java.util.List;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import shop.orders.Order;

public class OrderStreams {
  private final ReactiveOrders orders;

  public OrderStreams(ReactiveOrders orders) {
    this.orders = orders;
  }

  public Flux<Order> byReference(List<Long> ids) {
    return Flux.fromIterable(ids).flatMap(orders::findById);
  }

  public Flux<Order> byLambda(List<Long> ids) {
    return Flux.fromIterable(ids).filter(id -> id > 0).concatMap(id -> orders.findById(id));
  }

  public Flux<Mono<Order>> byHelper(List<Long> ids) {
    return Flux.fromIterable(ids).map(this::lookup);
  }

  private Mono<Order> lookup(Long id) {
    return orders.findById(id);
  }
}
