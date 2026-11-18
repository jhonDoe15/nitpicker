package shop.shared;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.locks.ReentrantLock;

public final class Listeners {
  private final List<Runnable> registered = new ArrayList<>();
  private final List<Runnable> safe = new CopyOnWriteArrayList<>();
  private final Map<String, Long> seen = new HashMap<>();
  private final Map<String, Long> loaded = new HashMap<>();
  private final Map<String, Long> confined = new HashMap<>();
  private final ExecutorService pool = Executors.newFixedThreadPool(2);
  private final ExecutorService serial = Executors.newSingleThreadExecutor();
  private final Map<String, Long> ordered = new HashMap<>();
  private final List<String> warmed = new ArrayList<>();
  private final ReentrantLock lock = new ReentrantLock();
  private final List<String> joined = new ArrayList<>();
  private final List<String> locked = new ArrayList<>();

  public Listeners() {
    registered.add(() -> { });
    loaded.put("start", 0L);
  }

  public void register(Runnable listener) {
    registered.add(listener); // violation: UnsynchronizedSharedCollection
  }

  public void unregister(Runnable listener) {
    synchronized (registered) {
      registered.remove(listener);
    }
  }

  public void notifyAll(String event) {
    List<Runnable> copy;
    synchronized (registered) {
      copy = new ArrayList<>(registered);
    }
    pool.submit(() -> copy.forEach(Runnable::run));
  }

  public void touch(String key) {
    CompletableFuture.runAsync(() -> seen.put(key, System.nanoTime())); // violation: UnsynchronizedSharedCollection
  }

  public void forget(String key) {
    pool.submit(() -> seen.remove(key)); // violation: UnsynchronizedSharedCollection
  }

  public boolean wasSeen(String key) {
    return seen.containsKey(key);
  }

  public void touchLocked(String key) {
    pool.execute(() -> {
      synchronized (loaded) {
        loaded.put(key, System.nanoTime());
      }
    });
  }

  public synchronized long loadedAt(String key) {
    return loaded.getOrDefault(key, 0L);
  }

  public void addSafe(Runnable listener) {
    safe.add(listener);
  }

  public void touchConfined(String key) {
    pool.execute(() -> confined.put(key, 1L));
  }

  public void reset() {
    List<Runnable> local = new ArrayList<>();
    local.add(() -> { });
    pool.execute(() -> local.add(() -> { }));
  }

  public void touchOrdered(String key) {
    serial.execute(() -> ordered.put(key, 1L));
  }

  public boolean wasOrdered(String key) {
    return ordered.containsKey(key);
  }

  @PostConstruct
  public void warm() {
    warmed.add("ready");
  }

  public int warmedCount() {
    synchronized (warmed) {
      return warmed.size();
    }
  }

  public int collect(String name) throws InterruptedException {
    Thread worker = new Thread(() -> joined.add(name));
    worker.start();
    worker.join(1000);
    return joined.size();
  }

  public void touchLocked(Runnable task) {
    pool.execute(() -> {
      lock.lock();
      try {
        locked.add("x");
        task.run();
      } finally {
        lock.unlock();
      }
    });
  }

  public int lockedSize() {
    synchronized (locked) {
      return locked.size();
    }
  }

  public void touchWithLock(String name) {
    pool.execute(() -> withLock(() -> locked.add(name)));
  }

  private void withLock(Runnable action) {
    lock.lock();
    try {
      action.run();
    } finally {
      lock.unlock();
    }
  }
}
