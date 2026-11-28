package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

// test: qualifiedMethodWrongThis_causesFinding_whenMatchOnErrorsFlagNotSet

class MemoryAllocatedInfoJava_edby61 {
  private static final class AllocationStats {
    @GuardedBy("MemoryAllocatedInfoJava_edby61.this")
    void addAllocation(long size) {}
  }

  public void addStackTrace(long size) {
    synchronized (this) {
      AllocationStats stat = new AllocationStats();
      // BUG: Diagnostic contains: Access should be guarded by enclosing instance
      // 'MemoryAllocatedInfoJava_edby61' of 'stat', which is not accessible in this scope; instead found:
      // 'this'
      stat.addAllocation(size);
    }
  }
}


// test: lambda

class Test_edby62 {
  @GuardedBy("this")
  int x;

  synchronized void f() {
    Runnable r =
        () -> {
          // BUG: Diagnostic contains: should be guarded by 'this',
          x++;
        };
  }
}

// test: staticMemberClass_enclosingInstanceLock


class Test_edby63 {
  final Object mu = new Object();

  private static final class Baz {
    @GuardedBy("mu")
    // BUG: Diagnostic contains: could not resolve guard
    int x;
  }

  public void m(Baz b) {
    synchronized (mu) {
      // BUG: Diagnostic contains: 'mu', which could not be resolved
      b.x++;
    }
  }
}

// test: staticMemberClass_staticOuterClassLock


class Test_edby64 {
  static final Object mu = new Object();

  private static final class Baz {
    @GuardedBy("mu")
    int x;
  }

  public void m(Baz b) {
    synchronized (mu) {
      b.x++;
    }
  }
}

// test: suppressionOnMethod


class Test_edby65 {
  final Object lock = null;

  void foo() {
    class Foo extends Object {
      @GuardedBy("lock")
      int x;

      @SuppressWarnings("GuardedBy")
      void m() {
        synchronized (lock) {
          int z = x++;
        }
      }
    }
  }
}

// test: missingGuard


@SuppressWarnings("GuardedBy")
class Lib_edby66 {
  @GuardedBy("lock")
  public void doSomething() {}
}

class Test_edby66 {
  void m(Lib_edby66 lib) {
    // BUG: Diagnostic contains: 'lock', which could not be resolved
    lib.doSomething();
  }
}

// test: parameterGuard

class Work_edby67 {
  final Object lock = new Object();

  Object getLock() {
    return lock;
  }

  @GuardedBy("getLock()")
  void workStarted() {}
}

class Worker_edby67 {
  @GuardedBy("work.getLock()")
  void f(Work_edby67 work) {
    work.workStarted(); // ok
  }

  @GuardedBy("work2.getLock()")
  // BUG: Diagnostic contains: could not resolve guard
  void g() {}

  @GuardedBy("a.getLock()")
  void g(Work_edby67 a, Work_edby67 b) {
    a.workStarted(); // ok
    // BUG: Diagnostic contains: should be guarded by 'b.getLock()'; instead found: 'a.getLock()'
    b.workStarted();
  }
}

abstract class Test_edby67 {
  abstract Work_edby67 getWork();

  void t(Worker_edby67 worker, Work_edby67 work) {
    synchronized (work.getLock()) {
      worker.f(work);
    }
    synchronized (getWork().getLock()) {
      // BUG: Diagnostic contains: guarded by 'work.getLock()'
      worker.f(getWork());
    }
    // BUG: Diagnostic contains: guarded by 'work.getLock()'
    worker.f(work);
  }
}


// test: parameterGuardNegative

class Work_edby68 {
  final Object lock = new Object();

  Object getLock() {
    return lock;
  }
}

class Worker_edby68 {
  @GuardedBy("work.getLock()")
  void f(Work_edby68 work) {}
}

class Test_edby68 {
  void t(Worker_edby68 worker, Work_edby68 work) {
    synchronized (work.getLock()) {
      worker.f(work);
    }
  }
}

// test: parameterGuardNegativeSimpleName

class Work_edby69 {
  final Object lock = new Object();

  Object getLock() {
    return lock;
  }
}

class Worker_edby69 {
  @GuardedBy("work.getLock()")
  void f(Work_edby69 work) {}

  void g() {
    Work_edby69 work = new Work_edby69();
    synchronized (work.getLock()) {
      f(work);
    }
  }
}

// test: varargsArity

class Test_edby70 {
  @GuardedBy("xs.toString()")
  void f(int x, Object... xs) {}

  void g() {
    Object[] xs = null;
    synchronized (xs.toString()) {
      f(0, xs);
    }
    // BUG: Diagnostic contains:
    f(0);
  }
}

// test: immediateLambdas

class Test_edby71 {
  @GuardedBy("this")
  private final List<String> xs = new ArrayList<>();

  @GuardedBy("ys")
  private final List<String> ys = new ArrayList<>();

  public synchronized void add(Optional<String> x) {
    x.ifPresent(y -> xs.add(y));
    x.ifPresent(xs::add);
    // BUG: Diagnostic contains:
    x.ifPresent(y -> ys.add(y));
    // BUG: Diagnostic contains:
    x.ifPresent(ys::add);
  }
}

// test: methodReferences_shouldBeFlagged

class Test_edby72 {
  @GuardedBy("this")
  private final List<String> xs = new ArrayList<>();

  private final List<Predicate<String>> preds = new ArrayList<>();

  public synchronized void test() {
    // BUG: Diagnostic contains:
    preds.add(xs::contains);
  }
}

