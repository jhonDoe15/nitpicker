package shop;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.ReentrantLock;

class Locks {
  private final Object monitor = new Object();
  private final ReentrantLock lock = new ReentrantLock();
  private final Semaphore single = new Semaphore(1);
  private final Semaphore bounded = new Semaphore(8);
  private final Map<Long, String> cache = new HashMap<>();
  private Gateway gateway;
  private String token;
  private boolean closed;

  String refresh() {
    synchronized (monitor) {
      if (token == null) {
        token = gateway.fetch(0);
      }
      return token;
    }
  }

  void cachedDownload(long id) {
    synchronized (monitor) {
      if (cache.containsKey(id)) {
        return;
      }
      cache.put(id, gateway.fetch(id));
    }
  }

  void cachedUnderLock(long id) {
    lock.lock();
    try {
      if (cache.containsKey(id)) {
        return;
      }
      cache.put(id, gateway.fetch(id));
    } finally {
      lock.unlock();
    }
  }

  void guardedByClosed(long id) {
    synchronized (monitor) {
      if (closed) {
        return;
      }
      cache.put(id, gateway.fetch(id));
    }
  }

  int guardedByArgument(long id, boolean skip) {
    lock.lock();
    try {
      if (skip) {
        return 1;
      }
      gateway.fetch(id);
      return 2;
    } finally {
      lock.unlock();
    }
  }

  void underSinglePermit(long id) throws InterruptedException {
    single.acquire();
    try {
      cache.put(id, gateway.fetch(id));
    } finally {
      single.release();
    }
  }

  void underBoundedPermits(long id) throws InterruptedException {
    bounded.acquire();
    try {
      gateway.fetch(id);
    } finally {
      bounded.release();
    }
  }

  void afterUnlock(long id) {
    lock.lock();
    try {
      cache.remove(id);
    } finally {
      lock.unlock();
    }
    gateway.fetch(id);
  }
}
