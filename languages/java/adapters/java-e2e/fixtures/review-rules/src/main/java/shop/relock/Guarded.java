package shop.relock;

import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class Guarded {
  private final Lock lock = new ReentrantLock();
  private final Lock other = new ReentrantLock();
  private final ReentrantReadWriteLock rwLock = new ReentrantReadWriteLock();
  private int value;

  public void plainBug() {
    lock.lock();
    try {
      value++;
    } finally {
      lock.lock(); // violation: LockInFinally
    }
  }

  public void readBug() {
    rwLock.readLock().lock();
    try {
      value++;
    } finally {
      rwLock.readLock().lock(); // violation: LockInFinally
    }
  }

  public void writeBug() {
    rwLock.writeLock().lock();
    try {
      value++;
    } finally {
      rwLock.writeLock().lock(); // violation: LockInFinally
    }
  }

  public void interruptibleBug() throws InterruptedException {
    lock.lockInterruptibly();
    try {
      value++;
    } finally {
      lock.lockInterruptibly(); // violation: LockInFinally
    }
  }

  public void correct() {
    lock.lock();
    try {
      value++;
    } finally {
      lock.unlock();
    }
  }

  public void correctReadWrite() {
    rwLock.readLock().lock();
    try {
      value++;
    } finally {
      rwLock.readLock().unlock();
    }
    rwLock.writeLock().lock();
    try {
      value--;
    } finally {
      rwLock.writeLock().unlock();
    }
  }

  public void handOver() {
    lock.lock();
    try {
      value++;
    } finally {
      lock.unlock();
      other.lock();
    }
    other.unlock();
  }

  public void reacquire() {
    lock.lock();
    try {
      lock.unlock();
      value++;
    } finally {
      lock.lock();
    }
    lock.unlock();
  }

  public void nestedUnlockedByOuter() {
    lock.lock();
    try {
      try {
        value++;
      } finally {
        lock.lock();
      }
    } finally {
      lock.unlock();
    }
  }

  public void lockBeforeTry() {
    lock.lock();
    value++;
    lock.unlock();
  }
}
