package shop.locking;

import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

public final class Transfers {
  private final Object accounts = new Object();
  private final Object audit = new Object();
  private final Lock ledger = new ReentrantLock();
  private final Lock journal = new ReentrantLock();
  private long moved;

  public void transfer(long amount) {
    synchronized (accounts) {
      synchronized (audit) { // violation: LockOrderInversion
        moved += amount;
      }
    }
  }

  public void report() {
    synchronized (this.audit) {
      synchronized (accounts) { // violation: LockOrderInversion
        moved = 0;
      }
    }
  }

  public void post() {
    ledger.lock();
    try {
      journal.lock(); // violation: LockOrderInversion
      try {
        moved += 1;
      } finally {
        journal.unlock();
      }
    } finally {
      ledger.unlock();
    }
  }

  public void close() {
    journal.lock();
    try {
      ledger.lock(); // violation: LockOrderInversion
      try {
        moved -= 1;
      } finally {
        ledger.unlock();
      }
    } finally {
      journal.unlock();
    }
  }

  public synchronized void settle() {
    synchronized (ledger) { // violation: LockOrderInversion
      moved *= 2;
    }
  }

  public void inspect() {
    synchronized (ledger) {
      synchronized (this) { // violation: LockOrderInversion
        moved /= 2;
      }
    }
  }

  public void swap() {
    synchronized (Registry.LOCK) {
      synchronized (journal) { // violation: LockOrderInversion
        moved += 3;
      }
    }
    synchronized (journal) {
      synchronized (Registry.LOCK) { // violation: LockOrderInversion
        moved -= 3;
      }
    }
  }
}
