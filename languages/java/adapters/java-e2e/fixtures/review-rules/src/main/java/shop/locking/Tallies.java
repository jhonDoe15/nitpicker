package shop.locking;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public final class Tallies {
  private static int created;
  private final Object lock = new Object();
  private final List<Runnable> tasks = new ArrayList<>();
  private int locked;
  private int unlocked;
  private int helped;
  private int deferred;
  private volatile boolean running;
  private AtomicInteger hits = new AtomicInteger();

  {
    locked = 1;
  }

  public Tallies(int start) {
    locked = start;
    synchronized (lock) {
      created += 1;
    }
  }

  public void lockedOnly() {
    synchronized (lock) {
      locked += 1;
      running = true;
      hits = new AtomicInteger();
      bumpHelped();
      deferred = 0;
    }
  }

  public void lockedAgain() {
    synchronized (lock) {
      locked = 0;
      helped = 0;
    }
  }

  public void unlockedOnly() {
    unlocked += 1;
  }

  public void unlockedAgain() {
    unlocked = 0;
  }

  public void stop() {
    running = false;
  }

  public void refresh() {
    hits = new AtomicInteger(1);
  }

  public void countCreated() {
    created += 1;
  }

  public void schedule() {
    tasks.add(() -> deferred += 1);
  }

  public void shadowed() {
    int locked = 0;
    locked += 1;
    unlocked = locked;
  }

  private void bumpHelped() {
    helped += 1;
  }

  public int total() {
    synchronized (lock) {
      return locked + unlocked + helped + deferred + hits.get() + created + (running ? 1 : 0);
    }
  }
}
