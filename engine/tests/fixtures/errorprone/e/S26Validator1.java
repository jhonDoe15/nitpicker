package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;

// test: positive


class Test_ator1 {
  @GuardedBy("This thread")
  // BUG: Diagnostic contains:
  // Invalid @GuardedBy expression: could not resolve guard
  int x;

  @GuardedBy("This thread")
  // BUG: Diagnostic contains:
  // Invalid @GuardedBy expression: could not resolve guard
  void m() {}
}

// test: negative


class Test_ator2 {
  final Object mu = new Object();

  class Inner {
    @GuardedBy("this")
    int x;

    @GuardedBy("Test_ator2.this")
    int p;

    @GuardedBy("Test_ator2.this.mu")
    int z;

    @GuardedBy("this")
    void m() {}

    @GuardedBy("mu")
    int v;

    @GuardedBy("itself")
    Object s_;
  }

  final Object o =
      new Object() {
        @GuardedBy("mu")
        int x;
      };
}

// test: itself


class Test_ator3 {
  @GuardedBy("itself")
  Object s_;
}

// test: badInstanceAccess


class Test_ator4 {
  final Object instanceField = new Object();

  @GuardedBy("Test_ator4.instanceField")
  // BUG: Diagnostic contains:
  // Invalid @GuardedBy expression: could not resolve guard
  Object s_;
}

// test: className


class Test_ator5 {
  @GuardedBy("Test_ator5")
  // BUG: Diagnostic contains:
  // Invalid @GuardedBy expression: could not resolve guard
  Object s_;
}

// test: anonymousClassTypo


class Test_ator6 {
  static class Endpoint {
    Object getLock() {
      return null;
    }
  }

  abstract static class Runnable {
    private Endpoint endpoint;

    Runnable(Endpoint endpoint) {
      this.endpoint = endpoint;
    }

    abstract void run();
  }

  static void m(Endpoint endpoint) {
    Runnable runnable =
        new Runnable(endpoint) {
          @GuardedBy("endpoint_.getLock()")
          // BUG: Diagnostic contains:
          // Invalid @GuardedBy expression: could not resolve guard
          void run() {}
        };
  }
}

// test: anonymousClassPrivateAccess


class Test_ator7 {
  static class Endpoint {
    Object getLock() {
      return null;
    }
  }

  abstract static class Runnable {
    private Endpoint endpoint;

    Runnable(Endpoint endpoint) {
      this.endpoint = endpoint;
    }

    abstract void run();
  }

  static void m(Endpoint endpoint) {
    Runnable runnable =
        new Runnable(endpoint) {
          @GuardedBy("endpoint.getLock()")
          // BUG: Diagnostic contains:
          // Invalid @GuardedBy expression: could not resolve guard
          void run() {}
        };
  }
}

// test: staticGuardedByInstance


class Test_ator8 {
  @GuardedBy("this")
  // BUG: Diagnostic contains:
  // Invalid @GuardedBy expression: static member guarded by instance
  static int x;
}

// test: staticGuardedByInstanceMethod


class Test_ator9 {
  final Object mu_ = new Object();

  Object lock() {
    return mu_;
  }

  @GuardedBy("lock()")
  // BUG: Diagnostic contains:
  // Invalid @GuardedBy expression: static member guarded by instance
  static int x;
}

// test: staticGuardedByStatic


class Test_ator10 {
  @GuardedBy("Test_ator10.class")
  static int x;
}

// test: nonExistantMethod


class Test_ator11 {
  @GuardedBy("lock()")
  // BUG: Diagnostic contains:
  // Invalid @GuardedBy expression: could not resolve guard
  int x;

  @GuardedBy("lock()")
  // BUG: Diagnostic contains:
  // Invalid @GuardedBy expression: could not resolve guard
  void m() {}
}

