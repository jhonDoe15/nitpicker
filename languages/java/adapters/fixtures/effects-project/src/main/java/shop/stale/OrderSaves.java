package shop.stale;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.retry.annotation.Retryable;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;
import shop.orders.Order;
import shop.orders.OrderRepository;
import shop.reactive.ReactiveOrders;

public class OrderSaves {
  private final ReactiveOrders reactive;
  private final OrderRepository orders;

  public OrderSaves(ReactiveOrders reactive, OrderRepository orders) {
    this.reactive = reactive;
    this.orders = orders;
  }

  public Mono<Order> resend(Order order) {
    return reactive.save(order).retryWhen(conflicts());
  }

  public Mono<Order> captured(Order order) {
    return Mono.defer(() -> reactive.save(order)).retryWhen(conflicts());
  }

  public Order loop(Order order) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        return orders.save(order);
      } catch (OptimisticLockingFailureException conflict) {
        continue;
      }
    }
    return order;
  }

  @Retryable(retryFor = OptimisticLockingFailureException.class)
  public Order annotated(Order order) {
    return orders.save(order);
  }

  private static Retry conflicts() {
    return Retry.max(3).filter(OptimisticLockingFailureException.class::isInstance);
  }
}
