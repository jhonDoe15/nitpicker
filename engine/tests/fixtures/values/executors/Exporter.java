package values.executors;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;

public class Exporter {
  private final Map<String, Future<?>> running = new ConcurrentHashMap<>();
  private final Map<String, ExecutorService> pools = new ConcurrentHashMap<>();
  private ExecutorService shared;

  public void export(String id, Runnable job) {
    ExecutorService pool = Executors.newFixedThreadPool(1);
    Future<?> future = pool.submit(job);
    running.put(id, future);
  }

  public void background(Runnable job) {
    ExecutorService pool = Executors.newFixedThreadPool(3);
    pool.execute(job);
  }

  public CompletableFuture<String> compute(String id) {
    ExecutorService pool = Executors.newFixedThreadPool(3);
    return CompletableFuture.supplyAsync(() -> id.trim(), pool);
  }

  public void shutDownAfter(Runnable job) throws InterruptedException {
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      pool.submit(job);
    } finally {
      pool.shutdown();
      pool.awaitTermination(1, java.util.concurrent.TimeUnit.SECONDS);
    }
  }

  public void scoped(Runnable job) {
    try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
      pool.submit(job);
    }
  }

  public ExecutorService create() {
    ExecutorService pool = Executors.newWorkStealingPool();
    return pool;
  }

  public void keep() {
    ExecutorService pool = Executors.newFixedThreadPool(2);
    this.shared = pool;
  }

  public void register(String id) {
    ExecutorService pool = Executors.newSingleThreadExecutor();
    pools.put(id, pool);
  }

  public void start() {
    ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    timer.submit(() -> running.clear());
  }

  public void inlineSubmit(String id, Runnable job) {
    ExecutorService pool = Executors.newFixedThreadPool(1);
    running.put(id, pool.submit(job));
  }

  public void eachJob(List<Runnable> jobs) {
    ExecutorService pool = Executors.newFixedThreadPool(4);
    jobs.forEach(job -> pool.submit(job));
  }

  public void existingResource(List<Runnable> jobs) {
    ExecutorService pool = Executors.newFixedThreadPool(4);
    try (pool) {
      jobs.forEach(pool::execute);
    }
  }

  public void aliased(Runnable job) {
    ExecutorService pool = Executors.newFixedThreadPool(4);
    ExecutorService other = pool;
    try {
      other.execute(job);
    } finally {
      other.shutdown();
    }
  }

  public void cachedPool(Runnable job) {
    ExecutorService pool = Executors.newCachedThreadPool();
    pool.execute(job);
  }

  public void singleThread(Runnable job) {
    ExecutorService pool = Executors.newSingleThreadExecutor();
    pool.execute(job);
  }

  public void stealing(Runnable job) {
    ExecutorService pool = Executors.newWorkStealingPool();
    pool.execute(job);
  }

  public void virtualThreads(List<Runnable> jobs) {
    ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor();
    jobs.forEach(pool::execute);
  }

  public static void main(String[] args) {
    ExecutorService pool = Executors.newFixedThreadPool(2);
    pool.submit(() -> args.length);
  }
}
