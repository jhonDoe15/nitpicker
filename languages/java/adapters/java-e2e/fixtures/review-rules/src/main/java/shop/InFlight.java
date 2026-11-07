package shop;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.function.Function;

public class InFlight {
  private final ConcurrentMap<String, CompletableFuture<String>> inProgress = new ConcurrentHashMap<>();
  private final Map<String, Integer> counts = new HashMap<>();
  private final Map<String, List<String>> groups = new HashMap<>();

  public CompletableFuture<String> nested(String key) {
    return inProgress.computeIfAbsent(key, k -> CompletableFuture.supplyAsync(() -> load(k))
        .whenComplete((result, error) -> inProgress.remove(k))); // violation: RecursiveMapUpdate
  }

  public CompletableFuture<String> cleanupAfterwards(String key) {
    CompletableFuture<String> started = inProgress.computeIfAbsent(key, this::start);
    started.whenComplete((result, error) -> inProgress.remove(key, started));
    return started;
  }

  public CompletableFuture<String> chainedCleanup(String key) {
    return inProgress.computeIfAbsent(key, this::start).whenComplete((r, e) -> inProgress.remove(key));
  }

  public int direct(String key) {
    return counts.computeIfAbsent(key, k -> counts.put("other", 1)); // violation: RecursiveMapUpdate
  }

  public int throughThis(String key) {
    return this.counts.compute(key, (k, v) -> {
      this.counts.clear(); // violation: RecursiveMapUpdate
      return 1;
    });
  }

  public int throughView(String key) {
    return counts.merge(key, 1, (a, b) -> {
      counts.keySet().remove("stale"); // violation: RecursiveMapUpdate
      return a + b;
    });
  }

  public CompletableFuture<String> reference(String key) {
    return inProgress.computeIfAbsent(key, this::startAndForget); // violation: RecursiveMapUpdate
  }

  public CompletableFuture<String> helper(String key) {
    return inProgress.computeIfAbsent(key, k -> startAndForget(k)); // violation: RecursiveMapUpdate
  }

  public int anonymous(String key) {
    return counts.computeIfAbsent(key, new Function<String, Integer>() {
      @Override
      public Integer apply(String k) {
        return counts.remove("old"); // violation: RecursiveMapUpdate
      }
    });
  }

  public int local(String key) {
    Map<String, Integer> seen = new HashMap<>();
    return seen.computeIfPresent(key, (k, v) -> seen.remove(k)); // violation: RecursiveMapUpdate
  }

  public List<String> otherMap(String key) {
    return groups.computeIfAbsent(key, k -> {
      counts.remove(k);
      return new ArrayList<>();
    });
  }

  public int readOnly(String key) {
    return counts.computeIfAbsent(key, k -> counts.getOrDefault("base", 0) + counts.size());
  }

  public int shadowed(String key) {
    Map<String, Integer> counts = new HashMap<>();
    return counts.computeIfAbsent(key, k -> bump(k));
  }

  public int shadowedThroughThis(String key) {
    Map<String, Integer> counts = new HashMap<>();
    return counts.computeIfAbsent(key, k -> this.counts.remove(k));
  }

  public int keyExpression(String key) {
    return counts.computeIfAbsent(String.valueOf(counts.remove(key)), k -> 1);
  }

  public CompletableFuture<String> overloadedHelper(String key) {
    return inProgress.computeIfAbsent(key, k -> startAndForget(k, 1));
  }

  public class Batch {
    private final Map<String, Integer> counts = new HashMap<>();

    public int outerMap(String key) {
      return InFlight.this.counts.computeIfAbsent(key, k -> counts.remove(k));
    }
  }

  private int bump(String k) {
    return counts.put(k, 1);
  }

  private CompletableFuture<String> start(String key) {
    return CompletableFuture.supplyAsync(() -> load(key));
  }

  private CompletableFuture<String> startAndForget(String key) {
    return CompletableFuture.supplyAsync(() -> load(key)).whenComplete((r, e) -> inProgress.remove(key));
  }

  private CompletableFuture<String> startAndForget(String key, int attempts) {
    return CompletableFuture.supplyAsync(() -> load(key + attempts));
  }

  private String load(String key) {
    return key;
  }
}
