package values.joins;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.springframework.scheduling.annotation.Async;

public class Prices {
  private final ExecutorService pool;

  public Prices(ExecutorService pool) {
    this.pool = pool;
  }

  private int price(String id) {
    return id.length();
  }

  private CompletableFuture<Integer> priceAsync(String id) {
    return CompletableFuture.supplyAsync(() -> price(id), pool);
  }

  @Async
  public CompletableFuture<Integer> priceInBackground(String id) {
    return CompletableFuture.completedFuture(price(id));
  }

  public List<Integer> sequentialJoin(List<String> ids) {
    return ids.stream()
        .map(id -> CompletableFuture.supplyAsync(() -> price(id), pool))
        .map(CompletableFuture::join)
        .collect(Collectors.toList());
  }

  public List<Integer> sequentialLambda(List<String> ids) {
    return ids.stream()
        .map(id -> CompletableFuture.supplyAsync(() -> price(id), pool))
        .map(future -> future.join())
        .collect(Collectors.toList());
  }

  public List<Integer> sequentialHelper(List<String> ids) {
    return ids.stream()
        .map(id -> priceInBackground(id))
        .filter(future -> future != null)
        .map(CompletableFuture::join)
        .collect(Collectors.toList());
  }

  public List<Integer> sequentialSubmit(List<String> ids) {
    return ids.stream()
        .map(id -> pool.submit(() -> price(id)))
        .map(future -> {
          try {
            return future.get();
          } catch (InterruptedException | ExecutionException e) {
            throw new IllegalStateException(e);
          }
        })
        .collect(Collectors.toList());
  }

  public List<Integer> loopJoin(List<String> ids) {
    List<Integer> result = new ArrayList<>();
    for (String id : ids) {
      result.add(CompletableFuture.supplyAsync(() -> price(id), pool).join());
    }
    return result;
  }

  public void runAndWait(Runnable task) {
    CompletableFuture.runAsync(task).join();
  }

  public List<Integer> startThenJoin(List<String> ids) {
    List<CompletableFuture<Integer>> pending = ids.stream()
        .map(id -> CompletableFuture.supplyAsync(() -> price(id), pool))
        .collect(Collectors.toList());
    return pending.stream().map(CompletableFuture::join).collect(Collectors.toList());
  }

  public List<Integer> startAllFirst(List<String> ids) {
    List<CompletableFuture<Integer>> pending = ids.stream().map(this::priceAsync).toList();
    return pending.stream().map(future -> future.join()).toList();
  }

  public int withDeadline(String id) throws ExecutionException, InterruptedException, TimeoutException {
    return CompletableFuture.supplyAsync(() -> price(id), pool).get(5, TimeUnit.SECONDS);
  }

  public int viaSubmit(String id) throws ExecutionException, InterruptedException {
    Future<Integer> future = pool.submit(() -> price(id));
    return future.get();
  }

  public int submitAndGet(String id) throws ExecutionException, InterruptedException {
    return pool.submit(() -> price(id)).get();
  }

  public List<Integer> plainMap(List<String> ids) {
    return ids.stream().map(this::price).collect(Collectors.toList());
  }

  public List<Integer> plainHelper(List<String> ids) {
    return ids.stream().map(id -> priceAsync(id)).map(CompletableFuture::join).toList();
  }

  public List<Integer> byIndex(List<CompletableFuture<Integer>> futures) {
    return IntStream.range(0, futures.size())
        .mapToObj(i -> futures.get(i))
        .map(CompletableFuture::join)
        .toList();
  }

  public List<Integer> fromMap(List<String> ids, Map<String, CompletableFuture<Integer>> started) {
    return ids.stream().map(id -> started.get(id)).map(CompletableFuture::join).toList();
  }

  public List<Integer> derived(List<CompletableFuture<Integer>> pending) {
    return pending.stream().map(f -> f.thenApply(x -> x * 2)).map(CompletableFuture::join).toList();
  }

  public List<Integer> sortedFirst(List<String> ids) {
    return ids.stream()
        .map(id -> CompletableFuture.supplyAsync(() -> price(id), pool))
        .sorted((a, b) -> 0)
        .map(CompletableFuture::join)
        .toList();
  }
}
