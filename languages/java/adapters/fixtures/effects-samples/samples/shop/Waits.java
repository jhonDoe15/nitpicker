package shop;

import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.scheduling.annotation.Async;

@Async
@interface Background {}

interface AsyncOrders {
  @Async
  CompletableFuture<Order> load(Long id);
}

class AsyncOrdersImpl implements AsyncOrders {
  OrderRepository orders;

  public CompletableFuture<Order> load(Long id) {
    return CompletableFuture.completedFuture(orders.getFirstByStatus("open"));
  }
}

class Waits {
  OrderRepository orders;
  ExecutorService executor;
  Order cached;

  ListenableFuture<List<Order>> guava() {
    return Futures.immediateFuture(orders.findByIdIn(List.of(1L)));
  }

  CompletableFuture<Order> completed(Long id) {
    Order order = orders.getFirstByStatus("open");
    return CompletableFuture.completedFuture(order);
  }

  @Async
  CompletableFuture<Order> spring(Long id) {
    return CompletableFuture.completedFuture(orders.getFirstByStatus("open"));
  }

  CompletableFuture<Order> submitted(Long id) {
    return CompletableFuture.supplyAsync(() -> orders.getFirstByStatus("open"), executor);
  }

  CompletableFuture<Order> constant() {
    return CompletableFuture.completedFuture(cached);
  }

  CompletableFuture<Order> parameter(Order order) {
    return CompletableFuture.completedFuture(order);
  }

  @Background
  CompletableFuture<Order> meta(Long id) {
    return CompletableFuture.completedFuture(orders.getFirstByStatus("open"));
  }

  Order timed(Long id) throws ExecutionException, InterruptedException, TimeoutException {
    return findAsync(id).get(2, TimeUnit.SECONDS);
  }

  Order limited(Long id) {
    return findAsync(id).orTimeout(2, TimeUnit.SECONDS).join();
  }

  Order find(Long id) {
    return orders.getFirstByStatus("open");
  }

  CompletableFuture<Order> findAsync(Long id) {
    return CompletableFuture.supplyAsync(() -> find(id), executor);
  }

  Order waits(Long id) throws ExecutionException, InterruptedException {
    return findAsync(id).get();
  }

  Order joins(Long id) {
    return findAsync(id).join();
  }

  Order unchecked(Long id) {
    return Futures.getUnchecked(findAsync(id));
  }

  Order noTwin(Long id) throws ExecutionException, InterruptedException {
    return startAsync(id).get();
  }

  CompletableFuture<Order> startAsync(Long id) {
    return CompletableFuture.supplyAsync(() -> find(id), executor);
  }

  Order overlapped(Long id) throws ExecutionException, InterruptedException {
    CompletableFuture<Order> pending = findAsync(id);
    Order other = find(id + 1);
    return other == null ? pending.get() : other;
  }
}
