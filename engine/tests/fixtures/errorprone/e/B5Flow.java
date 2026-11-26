package e;

import com.google.errorprone.annotations.concurrent.LazyInit;
import java.util.Comparator;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

class B5Flow {
  int finallyReturn() {
    try {
      return 1;
    } finally {
      return 2;
    }
  }

  void finallyThrow() {
    try {
      System.out.println();
    } finally {
      throw new RuntimeException();
    }
  }

  void finallyThrowCaught() {
    try {
      System.out.println();
    } finally {
      try {
        throw new RuntimeException();
      } catch (RuntimeException e) {
      }
    }
  }

  void finallyBreak() {
    for (int i = 0; i < 3; i++) {
      try {
        System.out.println();
      } finally {
        break;
      }
    }
  }

  void finallyContinue() {
    outer:
    for (int i = 0; i < 3; i++) {
      try {
        System.out.println();
      } finally {
        for (int j = 0; j < 2; j++) {
          continue;
        }
        continue outer;
      }
    }
  }

  void finallyLoopInside() {
    try {
      System.out.println();
    } finally {
      while (true) {
        break;
      }
      Runnable r = () -> {
        return;
      };
      new Object() {
        int f() {
          return 1;
        }
      };
    }
  }

  void finallySwitch(int k) {
    try {
      System.out.println();
    } finally {
      switch (k) {
        case 1:
          break;
        default:
      }
    }
  }

  void finallyLabeledBreak() {
    try {
      System.out.println();
    } finally {
      inner:
      {
        break inner;
      }
    }
  }

  void finallyThrowInTry() {
    try {
      System.out.println();
    } finally {
      try {
        throw new RuntimeException();
      } finally {
        System.out.println();
      }
    }
  }

  static final int MINUS = -1;

  void compare(String a, String b, Integer x, Comparator<String> c) {
    boolean r1 = a.compareTo(b) == 1;
    boolean r2 = a.compareTo(b) == -1;
    boolean r3 = a.compareTo(b) > -1;
    boolean r4 = a.compareTo(b) != -1;
    boolean r5 = a.compareTo(b) < 1;
    boolean r6 = a.compareTo(b) != 1;
    boolean r7 = a.compareTo(b) <= -1;
    boolean r8 = a.compareTo(b) >= 1;
    boolean r9 = a.compareTo(b) > 1;
    boolean r10 = (a.compareTo(b)) < 2;
    boolean r11 = 1 == a.compareTo(b);
    boolean r12 = -1 < a.compareTo(b);
    boolean r13 = 1 > a.compareTo(b);
    boolean r14 = 1 != a.compareTo(b);
    boolean r15 = a.compareTo(b) == 0;
    boolean r16 = c.compare(a, b) == 1;
    boolean r17 = Integer.compare(1, 2) == -1;
    boolean r18 = Integer.compare(1, 2) - 1 == 0;
    String s = "x" + a.compareTo(b);
    int t = a.compareTo(b) + 1;
    int u = 1 + a.compareTo(b);
    int v = a.compareTo(b) - x;
    boolean r19 = a.compareTo(b) == MINUS;
    boolean r20 = a.compareTo(b) == (1 + 1);
    boolean r21 = a.compareTo(b) > 0x0;
    boolean r22 = a.compareTo(b) >= -1;
    boolean r23 = x.compareTo(3) == -2;
    boolean r24 = a.compareTo(b) * 2 > 1;
  }

  Lock lock = new ReentrantLock();
  final Lock other = new ReentrantLock();

  void locks(Lock l) {
    l.lock();
    System.out.println();
    try {
      System.out.println();
    } finally {
      l.unlock();
    }
  }

  void locksOk(Lock l) {
    l.lock();
    try {
      System.out.println();
    } finally {
      l.unlock();
    }
  }

  void locksNoTry(Lock l) {
    l.lock();
    System.out.println();
    l.unlock();
  }

  void locksForgot(Lock l) {
    l.lock();
    System.out.println();
    l.lock();
  }

  void locksInside(Lock l) {
    try {
      l.lock();
      System.out.println();
    } finally {
      l.unlock();
    }
  }

  void locksInsideSecond(Lock l) {
    try {
      System.out.println();
      l.lock();
    } finally {
      l.unlock();
    }
  }

  void locksQuirk(Lock l) {
    try {
      l.lock();
    } finally {
      System.out.println();
      l.unlock();
    }
  }

  void locksQuirk2(Lock l) {
    try {
      l.lock();
    } finally {
      l.unlock();
      System.out.println();
    }
  }

  void locksOther(Lock l, Lock m) {
    l.lock();
    System.out.println();
    try {
      System.out.println();
    } finally {
      m.unlock();
    }
  }

  void locksThis() {
    this.lock.lock();
    System.out.println();
    this.lock.unlock();
  }

  void locksExpr() {
    boolean b = lock.tryLock();
    lock.lock();
    int a = 1;
  }

  void syncs() {
    synchronized (lock) {
      System.out.println();
    }
    synchronized (this.lock) {
      System.out.println();
    }
    synchronized ((lock)) {
      System.out.println();
    }
    synchronized (other) {
      System.out.println();
    }
    synchronized (this) {
      System.out.println();
    }
    synchronized (B5Flow.class) {
      System.out.println();
    }
    synchronized (counter) {
      System.out.println();
    }
    synchronized (lazy) {
      System.out.println();
    }
    Object local = new Object();
    synchronized (local) {
      System.out.println();
    }
  }

  void syncParam(B5Flow f, Object p) {
    synchronized (f.lock) {
      System.out.println();
    }
    synchronized (f.other) {
      System.out.println();
    }
    synchronized (p) {
      System.out.println();
    }
    synchronized (f.method()) {
      System.out.println();
    }
  }

  Object method() {
    return null;
  }

  static Object counter = new Object();
  @LazyInit Object lazy;

  @SuppressWarnings("SynchronizeOnNonFinalField")
  void quiet() {
    synchronized (lock) {
      System.out.println();
    }
  }

  static class W extends java.io.Writer {
    public void write(char[] c, int o, int l) {
      synchronized (lock) {
        System.out.println();
      }
    }

    public void flush() {}

    public void close() {}
  }
}
