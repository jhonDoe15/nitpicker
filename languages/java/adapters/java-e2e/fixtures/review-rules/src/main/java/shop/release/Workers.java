package shop.release;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class Workers implements AutoCloseable {
  private final ExecutorService executor;
  private final List<String> plan;
  private final FileInputStream input;

  public Workers(int threads, String name) {
    this.executor = Executors.newFixedThreadPool(threads); // violation: ConstructorLeaksResourceOnFailure
    this.plan = computePlan(name);
    this.input = null;
  }

  public Workers(String path) throws IOException {
    this.input = new FileInputStream(path); // violation: ConstructorLeaksResourceOnFailure
    if (path.isEmpty()) {
      throw new IllegalArgumentException("path");
    }
    this.plan = List.of(path);
    this.executor = null;
  }

  public Workers(List<String> plan) {
    this.plan = computePlan(plan.get(0));
    this.executor = Executors.newSingleThreadExecutor();
    this.input = null;
  }

  public Workers(int threads) {
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    try {
      this.plan = computePlan("plan");
    } catch (RuntimeException | Error e) {
      pool.shutdownNow();
      throw e;
    }
    this.executor = pool;
    this.input = null;
  }

  public Workers(String name, int threads) {
    this.plan = List.of(name);
    this.executor = Executors.newFixedThreadPool(threads);
    this.input = null;
  }

  public Workers(int threads, boolean strict) {
    this.executor = Executors.newFixedThreadPool(threads);
    if (strict && threads > 8) {
      throw new IllegalArgumentException("threads");
    }
    this.plan = List.of();
    this.input = null;
  }

  private static List<String> computePlan(String name) {
    return List.of(name, name.strip());
  }

  public List<String> plan() {
    return plan;
  }

  @Override
  public void close() throws IOException {
    if (executor != null) {
      executor.shutdownNow();
    }
    if (input != null) {
      input.close();
    }
  }
}
