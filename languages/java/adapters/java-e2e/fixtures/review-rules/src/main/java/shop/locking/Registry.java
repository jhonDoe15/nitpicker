package shop.locking;

import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

public final class Registry {
  static final Object LOCK = new Object();
  private static final Lock ENTRIES = new ReentrantLock();
  private final Object first = new Object();
  private final Object second = new Object();
  private final Object third = new Object();
  private final Lock reentrant = new ReentrantLock();
  private long entries;

  public void add() {
    synchronized (first) {
      synchronized (second) {
        entries += 1;
      }
    }
  }

  public void remove() {
    synchronized (this.first) {
      synchronized (second) {
        entries -= 1;
      }
    }
  }

  public void count() {
    synchronized (second) {
      entries *= 1;
    }
  }

  public void again() {
    synchronized (first) {
      synchronized (first) {
        entries += 2;
      }
    }
    reentrant.lock();
    try {
      reentrant.lock();
      try {
        entries -= 2;
      } finally {
        reentrant.unlock();
      }
    } finally {
      reentrant.unlock();
    }
  }

  public void passed(Object outer) {
    synchronized (outer) {
      synchronized (first) {
        entries += 3;
      }
    }
  }

  public void passedBack(Object outer) {
    synchronized (first) {
      synchronized (outer) {
        entries -= 3;
      }
    }
  }

  public void local() {
    Object second = new Object();
    synchronized (second) {
      synchronized (first) {
        entries += 4;
      }
    }
  }

  public Runnable later() {
    synchronized (second) {
      return () -> {
        synchronized (first) {
          entries -= 4;
        }
      };
    }
  }

  public void attempt() {
    synchronized (third) {
      if (ENTRIES.tryLock()) {
        try {
          synchronized (first) {
            entries += 5;
          }
        } finally {
          ENTRIES.unlock();
        }
      }
    }
  }

  public void released() {
    ENTRIES.lock();
    ENTRIES.unlock();
    synchronized (first) {
      synchronized (second) {
        entries -= 5;
      }
    }
  }

  public void staticAfter() {
    synchronized (first) {
      ENTRIES.lock();
      try {
        entries += 6;
      } finally {
        ENTRIES.unlock();
      }
    }
  }
}
