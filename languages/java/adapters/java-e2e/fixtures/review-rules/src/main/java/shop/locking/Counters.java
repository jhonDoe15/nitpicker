package shop.locking;

import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

public final class Counters {
  private final Object lock = new Object();
  private final Lock guard = new ReentrantLock();
  private int count;
  private volatile int hits;
  private long total;
  private String label = "";
  private volatile String owner = "";

  public void increment() {
    synchronized (lock) {
      count++;
      hits++;
    }
  }

  public void bump() {
    count++; // violation: InconsistentFieldLocking
  }

  public void reset() {
    this.count = 0; // violation: InconsistentFieldLocking
    hits += 1; // violation: InconsistentFieldLocking
  }

  public void add(long amount) {
    guard.lock();
    try {
      total += amount;
    } finally {
      guard.unlock();
    }
  }

  public void clear() {
    total = 0; // violation: InconsistentFieldLocking
  }

  public void addThenCount(long amount) {
    guard.lock();
    try {
      total += amount;
    } finally {
      guard.unlock();
    }
    total -= 1; // violation: InconsistentFieldLocking
  }

  public void tryAdd(long amount) {
    if (guard.tryLock()) {
      try {
        total += amount;
      } finally {
        guard.unlock();
      }
    }
  }

  public void claim(String owner) {
    synchronized (lock) {
      this.owner = owner + "!";
    }
  }

  public void release(String owner) {
    this.owner = owner;
  }

  public synchronized void name(String value) {
    label = value;
  }

  public void rename(String value) {
    this.label = value; // violation: InconsistentFieldLocking
  }

  public int count() {
    synchronized (lock) {
      return count + hits;
    }
  }

  public String summary() {
    return label + total + owner;
  }
}
