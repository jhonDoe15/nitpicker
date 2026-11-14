package shop.stale;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.retry.annotation.Retryable;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;
import shop.orders.Order;
import shop.orders.OrderRepository;
import shop.reactive.ReactiveOrders;

public class OrderSavesAllowed {
  private final ReactiveOrders reactive;
  private final OrderRepository orders;

  public OrderSavesAllowed(ReactiveOrders reactive, OrderRepository orders) {
    this.reactive = reactive;
    this.orders = orders;
  }

  public Mono<Order> reread(Long id) {
    return Mono.defer(() -> reactive.findById(id).flatMap(found -> reactive.save(found)))
        .retryWhen(Retry.max(3).filter(OptimisticLockingFailureException.class::isInstance));
  }

  public Mono<Order> otherFailure(Order order) {
    return reactive.save(order).retryWhen(Retry.max(3));
  }

  public Order loopReread(Long id) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        return orders.save(orders.findById(id).orElseThrow());
      } catch (OptimisticLockingFailureException conflict) {
        continue;
      }
    }
    return null;
  }

  @Retryable(retryFor = OptimisticLockingFailureException.class)
  public Order annotatedReread(Long id) {
    return orders.save(orders.findById(id).orElseThrow());
  }
}
