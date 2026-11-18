package shop.futures;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import shop.orders.Order;
import shop.orders.OrderRepository;

public class OrderFutures {
  private final OrderRepository orders;
  private final ExecutorService executor;

  public OrderFutures(OrderRepository orders, ExecutorService executor) {
    this.orders = orders;
    this.executor = executor;
  }

  public CompletableFuture<Order> wrapped(Long id) {
    Order order = orders.findById(id).orElse(null);
    return CompletableFuture.completedFuture(order);
  }

  public Order find(Long id) {
    return orders.findById(id).orElse(null);
  }

  public CompletableFuture<Order> findAsync(Long id) {
    return CompletableFuture.supplyAsync(() -> find(id), executor);
  }

  public Order waits(Long id) throws ExecutionException, InterruptedException {
    return findAsync(id).get();
  }
}
