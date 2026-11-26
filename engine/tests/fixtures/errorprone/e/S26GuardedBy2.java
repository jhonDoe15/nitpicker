package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;
import java.util.List;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

// test: i541


class Itself_edby13 {
  @GuardedBy("itself")
  List<String> xs;

  void f() {
    // BUG: Diagnostic contains:
    // should be guarded by 'this.xs'
    this.xs.add("");
    synchronized (this.xs) {
      this.xs.add("");
    }
    synchronized (this.xs) {
      xs.add("");
    }
    synchronized (xs) {
      this.xs.add("");
    }
    synchronized (xs) {
      xs.add("");
    }
  }
}

// test: methodQualifiedWithThis


class Itself_edby14 {
  @GuardedBy("this")
  void f() {}
  ;

  void g() {
    // BUG: Diagnostic contains:
    // should be guarded by 'this'
    this.f();
    synchronized (this) {
      f();
    }
    synchronized (this) {
      this.f();
    }
  }
}

// test: ctor


class Test_edby15 {
  @GuardedBy("this")
  int x;

  public Test_edby15() {
    this.x = 42;
  }
}

// test: badGuardMethodAccess


class Test_edby16 {
  @GuardedBy("this")
  void x() {}

  void m() {
    // BUG: Diagnostic contains: this
    x();
  }
}

// test: transitiveGuardMethodAccess


class Test_edby17 {
  @GuardedBy("this")
  void x() {}

  @GuardedBy("this")
  void m() {
    x();
  }
}

// test: readWriteLockCopy


class Test_edby18 {
  final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
  final Lock readLock = lock.readLock();
  final Lock writeLock = lock.writeLock();

  @GuardedBy("lock")
  boolean b = false;

  void m() {
    readLock.lock();
    try {
      b = true;
    } finally {
      readLock.unlock();
    }
  }

  void n() {
    writeLock.lock();
    try {
      b = true;
    } finally {
      writeLock.unlock();
    }
  }
}

// test: readWriteLock


class Test_edby19 {
  final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

  @GuardedBy("lock")
  boolean b = false;

  void m() {
    lock.readLock().lock();
    try {
      b = true;
    } finally {
      lock.readLock().unlock();
    }
  }

  void n() {
    lock.writeLock().lock();
    try {
      b = true;
    } finally {
      lock.writeLock().unlock();
    }
  }
}

// test: readWriteLockIsIgnored


class Test_edby20 {
  final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

  @GuardedBy("lock")
  boolean b = false;

  void m() {
    try {
      b = true;
    } finally {
    }
  }
}

// test: innerClass_enclosingClassLock


class Test_edby21 {
  final Object mu = new Object();

  @GuardedBy("mu")
  boolean b = false;

  private final class Baz {
    public void m() {
      synchronized (mu) {
        n();
      }
    }

    @GuardedBy("Test_edby21.this.mu")
    private void n() {
      b = true;
    }
  }
}

// test: innerClass_thisLock


class Test_edby22 {
  @GuardedBy("this")
  boolean b = false;

  private final class Baz {
    private synchronized void n() {
      // BUG: Diagnostic contains:
      // should be guarded by 'Test_edby22.this'
      b = true;
    }
  }
}

// test: anonymousClass


class Test_edby23 {
  @GuardedBy("this")
  boolean b = false;

  private synchronized void n() {
    b = true;
    new Object() {
      void m() {
        // BUG: Diagnostic contains:
        // should be guarded by 'Test_edby23.this'
        b = true;
      }
    };
  }
}

// test: inheritedLock


class A_edby24 {
  final Object lock = new Object();
}

class B_edby24 extends A_edby24 {
  @GuardedBy("lock")
  boolean b = false;

  void m() {
    synchronized (lock) {
      b = true;
    }
    ;
  }
}

