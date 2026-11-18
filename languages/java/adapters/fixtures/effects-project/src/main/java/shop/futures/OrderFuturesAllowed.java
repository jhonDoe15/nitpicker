package shop.futures;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import org.springframework.scheduling.annotation.Async;
import shop.orders.Order;
import shop.orders.OrderRepository;

public class OrderFuturesAllowed {
  private final OrderRepository orders;
  private final ExecutorService executor;

  public OrderFuturesAllowed(OrderRepository orders, ExecutorService executor) {
    this.orders = orders;
    this.executor = executor;
  }

  @Async
  public CompletableFuture<Order> springAsync(Long id) {
    return CompletableFuture.completedFuture(orders.findById(id).orElse(null));
  }

  public CompletableFuture<Order> submitted(Long id) {
    return CompletableFuture.supplyAsync(() -> orders.findById(id).orElse(null), executor);
  }

  public CompletableFuture<Order> known(Order order) {
    return CompletableFuture.completedFuture(order);
  }

  public CompletableFuture<Order> startAsync(Long id) {
    return submitted(id);
  }

  public Order withoutTwin(Long id) throws ExecutionException, InterruptedException {
    return startAsync(id).get();
  }

  public Order overlapped(Long id) throws ExecutionException, InterruptedException {
    CompletableFuture<Order> pending = submitted(id);
    Order other = orders.findById(id + 1).orElse(null);
    return other == null ? pending.get() : other;
  }
}
