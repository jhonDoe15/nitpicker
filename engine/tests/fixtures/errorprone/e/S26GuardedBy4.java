package e;

import com.google.common.util.concurrent.Monitor;
import com.google.errorprone.annotations.concurrent.GuardedBy;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.Lock;

// test: instanceAccess_namedThisGuard


class InstanceAccess_NamedThisGuard_edby37 {
  class Outer {
    class Inner {
      @GuardedBy("Outer.this")
      int x;

      void m() {
        synchronized (Outer.this) {
          x++;
        }
        // BUG: Diagnostic contains:
        // should be guarded by 'Outer.this'
        x++;
      }
    }
  }
}

// test: lexicalAccess_thisGuard


class LexicalAccess_ThisGuard_edby38 {
  class Outer {
    @GuardedBy("this")
    int x;

    class Inner {
      void m() {
        synchronized (Outer.this) {
          Outer.this.x++;
        }
        // BUG: Diagnostic contains:
        // should be guarded by 'Outer.this'
        Outer.this.x++;
      }
    }
  }
}

// test: lexicalAccess_namedThisGuard


class LexicalAccess_NamedThisGuard_edby39 {
  class Outer {
    class Inner {
      @GuardedBy("Outer.this")
      int x;

      class InnerMost {
        void m() {
          synchronized (Outer.this) {
            Inner.this.x++;
          }
          // BUG: Diagnostic contains:
          // should be guarded by 'Outer.this'
          Inner.this.x++;
        }
      }
    }
  }
}

// test: complexLockExpression

class ComplexLockExpression_edby40 {
  final Object[] xs = {};
  final int[] ys = {};

  void m(int i) {
    synchronized (xs[i]) {
      ys[i]++;
    }
  }
}

// test: wrongInnerClassInstance


class WrongInnerClassInstance_edby41 {
  final Object lock = new Object();

  class Inner {
    @GuardedBy("lock")
    int x = 0;

    void m(Inner i) {
      synchronized (WrongInnerClassInstance_edby41.this.lock) {
        // BUG: Diagnostic contains:
        // guarded by 'lock' in enclosing instance 'e.WrongInnerClassInstance_edby41' of 'i'
        i.x++;
      }
    }
  }
}


// test: tryWithResources


class Test_edby42 {
  Lock lock;

  @GuardedBy("lock")
  int x;

  static class LockCloser implements AutoCloseable {
    Lock lock;

    LockCloser(Lock lock) {
      this.lock = lock;
      this.lock.lock();
    }

    @Override
    public void close() throws Exception {
      lock.unlock();
    }
  }

  void m() throws Exception {
    try (LockCloser ignored = new LockCloser(lock)) {
      x++;
    }
  }
}

// test: tryWithResources_resourceVariables


class Test_edby43 {
  Lock lock;

  @GuardedBy("lock")
  int x;

  void m(AutoCloseable c) throws Exception {
    try (AutoCloseable unused = c) {
      // BUG: Diagnostic contains:
      x++;
    } catch (Exception e) {
      // BUG: Diagnostic contains:
      // should be guarded by 'this.lock'
      x++;
      throw e;
    } finally {
      // BUG: Diagnostic contains:
      // should be guarded by 'this.lock'
      x++;
    }
  }

  void n(AutoCloseable c) throws Exception {
    lock.lock();
    try (AutoCloseable unused = c) {
    } catch (Exception e) {
      x++;
    } finally {
      lock.unlock();
    }
  }
}

// test: lexicalScopingExampleOne


class Transaction_edby44 {
  @GuardedBy("this")
  int x;

  interface Handler {
    void apply();
  }

  public void handle() {
    runHandler(
        new Handler() {
          public void apply() {
            // BUG: Diagnostic contains:
            // should be guarded by 'Transaction_edby44.this'
            x++;
          }
        });
  }

  private synchronized void runHandler(Handler handler) {
    handler.apply();
  }
}

// test: lexicalScopingExampleTwo


class Transaction_edby45 {
  @GuardedBy("this")
  int x;

  interface Handler {
    void apply();
  }

  public void handle() {
    runHandler(
        new Handler() {
          @GuardedBy("Transaction_edby45.this")
          public void apply() {
            x++;
          }
        });
  }

  private synchronized void runHandler(Handler handler) {
    // This isn't safe...
    handler.apply();
  }
}

// test: aliasing


class Names_edby46 {
  @GuardedBy("this")
  List<String> names = new ArrayList<>();

  public void addName(String name) {
    List<String> copyOfNames;
    synchronized (this) {
      copyOfNames = names; // OK: access of 'names' guarded by 'this'
    }
    copyOfNames.add(name); // should be an error: this access is not thread-safe!
  }
}

// test: monitorGuard


class Test_edby47 {
  final Monitor monitor = new Monitor();

  @GuardedBy("monitor")
  int x;

  final Monitor.Guard guard =
      new Monitor.Guard(monitor) {
        @Override
        public boolean isSatisfied() {
          x++;
          return true;
        }
      };
}

// test: semaphore


class Test_edby48 {
  final Semaphore semaphore = null;

  @GuardedBy("semaphore")
  int x;

  void m() throws InterruptedException {
    semaphore.acquire();
    // BUG: Diagnostic contains:
    // access should be guarded by 'this.semaphore'
    x++;
    try {
      x++;
    } finally {
      semaphore.release();
    }
    // BUG: Diagnostic contains:
    // access should be guarded by 'this.semaphore'
    x++;
  }
}

