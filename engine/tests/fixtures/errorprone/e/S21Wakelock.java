import android.os.PowerManager.WakeLock;
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;

class S21WakeIsHeld {
  void foo(WakeLock wakelock) {
    wakelock.acquire(100);
    if (wakelock.isHeld()) {
      doSomethingElse();
      wakelock.release();

      // Make sure comments are preserved
    }
  }

  void other(WakeLock wl1, WakeLock wl2) {
    wl1.acquire(100);
    if (wl2.isHeld()) {
      wl1.release();
    }
  }

  void lambda(WakeLock wakelock) {
    wakelock.acquire(100);
    doThing(() -> wakelock.release());
  }

  void suppressed(WakeLock wakelock) {
    wakelock.acquire(100);
    @SuppressWarnings("WakelockReleasedDangerously")
    Runnable r = () -> wakelock.release();
  }

  void doSomethingElse() {}

  void doThing(Runnable thing) {}
}

class S21WakeOk {
  void withoutTimeout(WakeLock wakelock) {
    wakelock.acquire();
    wakelock.release();
  }

  void catchesRuntime(WakeLock wakelock) {
    wakelock.acquire(100);
    try {
      wakelock.release();
    } catch (RuntimeException e) {
    }
  }

  void catchesSuper(WakeLock wakelock) {
    wakelock.acquire(100);
    try {
      wakelock.release();
    } catch (Exception e) {
    }
  }
}

class S21WakeCatches {
  static class MyRuntime extends RuntimeException {}

  static class MyOther extends Exception {}

  void noCatch(WakeLock wakelock) throws IOException {
    wakelock.acquire(100);
    try (BufferedReader br = new BufferedReader(new FileReader(""))) {
      wakelock.release();
    }
  }

  void subclass(WakeLock wakelock) {
    wakelock.acquire(100);
    try {
      wakelock.release();
    } catch (MyRuntime e) {
    }
  }

  void other(WakeLock wakelock) {
    wakelock.acquire(100);
    try {
      wakelock.release();
      throw new MyOther();
    } catch (MyOther e) {
    }
  }

  void nested(WakeLock wakelock) {
    wakelock.acquire(100);
    try {
      try {
        wakelock.release();
        throw new MyOther();
      } catch (MyOther e) {
      }
    } catch (RuntimeException err) {
    }
  }

  void unionOk(WakeLock wakelock) {
    wakelock.acquire(100);
    try {
      wakelock.release();
      throw new MyOther();
    } catch (RuntimeException | MyOther e) {
    }
  }

  void unionBad(WakeLock wakelock) {
    wakelock.acquire(100);
    try {
      wakelock.release();
      throw new IOException();
    } catch (IOException | NullPointerException e) {
    }
  }
}

class S21WakeField {
  WakeLock wakelock = new WakeLock();

  S21WakeField(WakeLock wl) {
    this.wakelock = wl;
    this.wakelock.acquire(100);
  }

  void foo() {
    wakelock.release();
  }
}

class S21WakeFieldNoTimeout {
  WakeLock wakelock = new WakeLock();

  S21WakeFieldNoTimeout(WakeLock wl) {
    this.wakelock = wl;
    this.wakelock.acquire();
  }

  void foo() {
    wakelock.release();
  }
}

class S21WakeDifferent {
  void bar(WakeLock wakelock) {
    wakelock.acquire(100);
  }

  void foo(WakeLock wakelock) {
    wakelock.release();
  }
}

class S21WakeMethod {
  WakeLock wakelock = new WakeLock();

  WakeLock getWakelock() {
    return wakelock;
  }

  void bar() {
    getWakelock().acquire(100);
  }

  void foo() {
    getWakelock().release();
  }
}

class S21WakeMethodNoTimeout {
  WakeLock wakelock = new WakeLock();

  WakeLock getWakelock() {
    return wakelock;
  }

  void bar(WakeLock wakelock) {
    getWakelock().acquire();
  }

  void foo(WakeLock wakelock) {
    getWakelock().release();
  }
}

class S21WakeCounted {
  void notCounted(WakeLock wakelock) {
    wakelock.setReferenceCounted(false);
    wakelock.acquire(100);
    wakelock.release();
  }

  void counted(WakeLock wakelock) {
    wakelock.setReferenceCounted(true);
    wakelock.acquire(100);
    wakelock.release();
  }

  void notCountedNoTimeout(WakeLock wakelock) {
    wakelock.setReferenceCounted(false);
    wakelock.acquire();
    wakelock.release();
  }

  void countedNoTimeout(WakeLock wakelock) {
    wakelock.setReferenceCounted(true);
    wakelock.acquire();
    wakelock.release();
  }
}

class S21WakeOuterNeg {
  WakeLock wakelock = new WakeLock();

  S21WakeOuterNeg(WakeLock wl) {
    this.wakelock = wl;
    this.wakelock.setReferenceCounted(false);
  }

  public class Inner {
    void foo() {
      wakelock.acquire(100);
      wakelock.release();
    }
  }
}

class S21WakeOuterPos {
  WakeLock wakelock = new WakeLock();

  S21WakeOuterPos(WakeLock wl) {
    wakelock = wl;
    wakelock.acquire(100);
  }

  public class Inner {
    void foo() {
      wakelock.release();
    }
  }
}
