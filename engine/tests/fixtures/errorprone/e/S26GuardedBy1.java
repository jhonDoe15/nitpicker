package e;

import com.google.common.util.concurrent.Monitor;
import com.google.errorprone.annotations.concurrent.GuardedBy;
import java.util.concurrent.locks.Lock;

// test: locked


class Test_edby1 {
  final Lock lock = null;

  @GuardedBy("lock")
  int x;

  void m() {
    lock.lock();
    // BUG: Diagnostic contains:
    // access should be guarded by 'this.lock'
    x++;
    try {
      x++;
    } catch (Exception e) {
      x--;
    } finally {
      lock.unlock();
    }
    // BUG: Diagnostic contains:
    // access should be guarded by 'this.lock'
    x++;
  }
}

// test: staticLocked


class Test_edby2 {
  @GuardedBy("Test_edby2.class")
  static int x;

  static synchronized void m() {
    x++;
  }
}

// test: monitor


class Test_edby3 {
  final Monitor monitor = null;

  @GuardedBy("monitor")
  int x;

  void m() {
    monitor.enter();
    // BUG: Diagnostic contains:
    // access should be guarded by 'this.monitor'
    x++;
    try {
      x++;
    } finally {
      monitor.leave();
    }
    // BUG: Diagnostic contains:
    // access should be guarded by 'this.monitor'
    x++;
  }
}

// test: wrongLock


class Test_edby4 {
  final Lock lock1 = null;
  final Lock lock2 = null;

  @GuardedBy("lock1")
  int x;

  void m() {
    lock2.lock();
    try {
      // BUG: Diagnostic contains:
      // access should be guarded by 'this.lock1'
      x++;
    } finally {
      lock2.unlock();
    }
  }
}

// test: guardedStaticFieldAccess_1


class Test_edby5 {
  public static final Object lock = new Object();

  @GuardedBy("lock")
  public static int x;

  void m() {
    synchronized (Test_edby5.lock) {
      Test_edby5.x++;
    }
  }
}

// test: guardedStaticFieldAccess_2


class Test_edby6 {
  public static final Object lock = new Object();

  @GuardedBy("lock")
  public static int x;

  void m() {
    synchronized (lock) {
      Test_edby6.x++;
    }
  }
}

// test: guardedStaticFieldAccess_3


class Test_edby7 {
  public static final Object lock = new Object();

  @GuardedBy("lock")
  public static int x;

  void m() {
    synchronized (Test_edby7.lock) {
      x++;
    }
  }
}

// test: guardedStaticFieldAccess_enclosingClass


class Test_edby8 {
  @GuardedBy("Test_edby8.class")
  public static int x;

  static synchronized void n() {
    Test_edby8.x++;
  }
}

// test: badStaticFieldAccess


class Test_edby9 {
  public static final Object lock = new Object();

  @GuardedBy("lock")
  public static int x;

  void m() {
    // BUG: Diagnostic contains:
    // access should be guarded by 'Test_edby9.lock'
    Test_edby9.x++;
  }
}

// test: badGuard


class Test_edby10 {
  @GuardedBy("foo")
  // BUG: Diagnostic contains: Invalid @GuardedBy expression
  int y;
}

// test: unheldInstanceGuard


class Test_edby11 {
  final Object mu = new Object();

  @GuardedBy("mu")
  int y;
}

class Main_edby11 {
  void m(Test_edby11 t) {
    // BUG: Diagnostic contains:
    // should be guarded by 't.mu'
    t.y++;
  }
}

// test: unheldItselfGuard


class Itself_edby12 {
  @GuardedBy("itself")
  int x;

  void incrementX() {
    // BUG: Diagnostic contains:
    // should be guarded by 'this.x'
    x++;
  }
}

