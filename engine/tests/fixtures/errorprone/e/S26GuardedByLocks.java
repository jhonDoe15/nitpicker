package e;

import com.google.common.util.concurrent.Monitor;
import com.google.errorprone.annotations.concurrent.GuardedBy;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

class S26Locks {
  final Object mu = new Object();
  final Lock lock = new ReentrantLock();
  final Monitor monitor = new Monitor();
  final Semaphore semaphore = new Semaphore(1);
  final ReadWriteLock rw = new ReentrantReadWriteLock();
  static final Object SMU = new Object();

  @GuardedBy("mu")
  int a;

  @GuardedBy("lock")
  int b;

  @GuardedBy("monitor")
  int c;

  @GuardedBy("semaphore")
  int d;

  @GuardedBy("rw")
  int rwGuarded;

  @GuardedBy("this")
  int self;

  @GuardedBy("S26Locks.class")
  static int classGuarded;

  @GuardedBy("SMU")
  static int staticGuarded;

  @GuardedBy("S26Locks.SMU")
  static int qualifiedStatic;

  @GuardedBy("this.mu")
  int viaThis;

  @GuardedBy("mu")
  @javax.annotation.concurrent.GuardedBy("lock")
  int two;

  @GuardedBy("(mu)")
  int parens;

  @GuardedBy("mu /* c */")
  int trailingComment;

  @GuardedBy(" mu")
  int leading;

  void sync() {
    synchronized (mu) {
      a++;
      viaThis++;
    }
    synchronized (this.mu) {
      a++;
    }
    synchronized (this) {
      self++;
    }
    synchronized (S26Locks.class) {
      classGuarded++;
    }
    synchronized (SMU) {
      staticGuarded++;
      qualifiedStatic++;
    }
    a++;
    self++;
    classGuarded++;
    staticGuarded++;
  }

  void unlock() {
    lock.lock();
    try {
      b++;
    } finally {
      lock.unlock();
    }
    b++;
  }

  void tryCatch() {
    lock.lock();
    try {
      b++;
    } catch (RuntimeException e) {
      b++;
    } finally {
      lock.unlock();
    }
    try {
      b++;
    } finally {
      b++;
    }
  }

  void monitorMethods() {
    monitor.enter();
    try {
      c++;
    } finally {
      monitor.leave();
    }
    c++;
  }

  void semaphores() throws InterruptedException {
    semaphore.acquire();
    try {
      d++;
    } finally {
      semaphore.release();
    }
    semaphore.acquire(2);
    try {
      d++;
    } finally {
      semaphore.release(2);
    }
  }

  void readWrite() {
    rw.readLock().lock();
    try {
      rwGuarded++;
    } finally {
      rw.readLock().unlock();
    }
    rw.writeLock().lock();
    try {
      rwGuarded++;
    } finally {
      rw.writeLock().unlock();
    }
  }

  void multi() {
    synchronized (mu) {
      two++;
    }
    lock.lock();
    try {
      two++;
    } finally {
      lock.unlock();
    }
  }

  synchronized void syncMethod() {
    self++;
    a++;
  }

  static synchronized void staticSyncMethod() {
    classGuarded++;
    staticGuarded++;
  }

  void other(S26Locks that) {
    synchronized (that.mu) {
      that.a++;
      a++;
    }
    synchronized (this) {
      that.self++;
    }
    that.a++;
  }

  void localLock(Object x) {
    Object local = new Object();
    synchronized (local) {
      a++;
    }
    synchronized (x) {
      a++;
    }
  }

  void nested() {
    synchronized (mu) {
      synchronized (this) {
        a++;
        self++;
      }
    }
  }

  void viaMethod() {
    synchronized (getMu()) {
      a++;
    }
  }

  Object getMu() {
    return mu;
  }

  @SuppressWarnings("GuardedBy")
  void suppressed() {
    a++;
  }

  @SuppressWarnings("GuardedByChecker")
  void suppressedAlt() {
    a++;
  }

  @SuppressWarnings("all")
  void suppressedAll() {
    a++;
  }

  @SuppressWarnings("Other")
  void notSuppressed() {
    a++;
  }

  void localSuppressed() {
    @SuppressWarnings("GuardedBy")
    int x = a;
    int y = a;
  }
}

@SuppressWarnings("GuardedBy")
class S26SuppressedClass {
  final Object mu = new Object();

  @GuardedBy("mu")
  int a;

  void m() {
    a++;
  }
}

class S26SuppressedField {
  final Object mu = new Object();

  @SuppressWarnings("GuardedBy")
  @GuardedBy("nothing")
  int invalid;

  @SuppressWarnings("GuardedBy")
  Object other = new Object() {
    @GuardedBy("mu")
    int a;
  };
}
