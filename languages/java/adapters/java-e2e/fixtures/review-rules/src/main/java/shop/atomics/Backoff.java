package shop.atomics;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

public class Backoff {
  private final AtomicInteger attempts = new AtomicInteger();
  private final AtomicLong highest = new AtomicLong();
  private final AtomicBoolean started = new AtomicBoolean();
  private final AtomicReference<String> label = new AtomicReference<>("");

  public void retry() {
    attempts.set(Math.min(attempts.get() + 1, 10)); // violation: AtomicGetThenSet
  }

  public void record(long value) {
    this.highest.set(Math.max(this.highest.get(), value)); // violation: AtomicGetThenSet
  }

  public void start(Runnable task) {
    if (!started.get()) {
      started.set(true); // violation: AtomicGetThenSet
      task.run();
    }
  }

  public void startOnce(Runnable task) {
    if (started.compareAndSet(false, true)) {
      task.run();
    }
  }

  public void grow() {
    attempts.incrementAndGet();
    highest.updateAndGet(current -> current + 1);
  }

  public void copyFrom(Backoff other) {
    label.set(other.label.get());
  }

  public void rename(String next) {
    if (!label.get().equals(next)) {
      label.set(next);
    }
  }

  public void stop() {
    if (started.get()) {
      started.set(false);
    }
  }

  public synchronized void resetLocked() {
    attempts.set(attempts.get() - 1);
  }

  public int local() {
    AtomicInteger seen = new AtomicInteger();
    seen.set(seen.get() + 1);
    return seen.get();
  }
}
