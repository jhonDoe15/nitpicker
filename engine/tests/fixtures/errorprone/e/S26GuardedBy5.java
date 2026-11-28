package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReadWriteLock;

// test: synchronizedOnLockMethod_negative

// do not remove, regression test for a bug when RWL is on the classpath

class Test_edby49 {
  Object lock() {
    return null;
  }

  @GuardedBy("lock()")
  int x;

  void m() {
    synchronized (lock()) {
      x++;
    }
  }
}

// test: suppressLocalVariable


class Test_edby50 {
  final Lock lock = null;

  @GuardedBy("lock")
  int x;

  void m() {
    @SuppressWarnings("GuardedBy")
    int z = x++;
  }
}

// test: enclosingBlockScope


class Test_edby51 {
  public final Object mu = new Object();

  @GuardedBy("mu")
  int x = 1;

  {
    new Object() {
      void f() {
        synchronized (mu) {
          x++;
        }
      }
    };
  }
}

// test: instanceInitializersAreUnchecked


class Test_edby52 {
  public final Object mu1 = new Object();
  public final Object mu2 = new Object();

  @GuardedBy("mu1")
  int x = 1;

  {
    synchronized (mu2) {
      x++;
    }
    synchronized (mu1) {
      x++;
    }
  }
}

// test: classInitializersAreUnchecked


class Test_edby53 {
  public static final Object mu1 = new Object();
  public static final Object mu2 = new Object();

  @GuardedBy("mu1")
  static int x = 1;

  static {
    synchronized (mu2) {
      x++;
    }
    synchronized (mu1) {
      x++;
    }
  }
}

// test: staticFieldInitializersAreUnchecked


class Test_edby54 {
  public static final Object mu = new Object();

  @GuardedBy("mu")
  static int x0 = 1;

  static int x1 = x0++;
}

// test: instanceFieldInitializersAreUnchecked


class Test_edby55 {
  public final Object mu = new Object();

  @GuardedBy("mu")
  int x0 = 1;

  int x1 = x0++;
}

// test: innerClassMethod


class Test_edby56 {
  public final Object mu = new Object();

  class Inner {
    @GuardedBy("mu")
    int x;

    @GuardedBy("Test_edby56.this")
    int y;
  }

  void f(Inner i) {
    synchronized (mu) {
      // BUG: Diagnostic contains:
      // guarded by 'mu' in enclosing instance 'e.Test_edby56' of 'i'
      i.x++;
    }
  }

  synchronized void g(Inner i) {
    // BUG: Diagnostic contains:
    // guarded by enclosing instance 'e.Test_edby56' of 'i'
    i.y++;
  }
}

// test: innerClassInMethod


class Test_edby57 {
  public final Object mu = new Object();

  @GuardedBy("mu")
  int i = 0;

  void f() {
    class Inner {
      @GuardedBy("mu")
      void m() {
        i++;
      }
    }
    Inner i = new Inner();
    synchronized (mu) {
      i.m();
    }
  }
}

// test: innerClassMethod_classBoundary


class Outer_edby58 {
  public final Object mu = new Object();

  class Inner {
    @GuardedBy("mu")
    int x;

    @GuardedBy("Outer_edby58.this")
    int y;
  }
}


class Test_edby58 {
  void f() {
    Outer_edby58 a = new Outer_edby58();
    Outer_edby58 b = new Outer_edby58();
    Outer_edby58.Inner ai = a.new Inner();
    synchronized (b.mu) {
      // BUG: Diagnostic contains:
      // Access should be guarded by 'mu' in enclosing instance 'e.Outer_edby58' of 'ai', which
      // is not accessible in this scope; instead found: 'b.mu'
      ai.x++;
    }
    synchronized (b) {
      // BUG: Diagnostic contains:
      // Access should be guarded by enclosing instance 'e.Outer_edby58' of 'ai', which is not
      // accessible in this scope; instead found: 'b'
      ai.y++;
    }
  }
}


// test: regression_b27686620
class A_edby59 extends One_edby59 {
  void g() {}
}

class One_edby59 {
  @GuardedBy("One_edby59.class")
  static int x = 1;

  static void f() {
    synchronized (One_edby59.class) {
      x++;
    }
  }
}

class Two_edby59 {
  @GuardedBy("Two_edby59.class")
  static int x = 1;

  static void f() {
    synchronized (Two_edby59.class) {
      x++;
    }
  }
}
class B_edby59 extends Two_edby59 {
  void g() {}
}

// test: qualifiedMethod


class Test_edby60 {
  @GuardedBy("this")
  void f() {}

  void main() {
    // BUG: Diagnostic contains: 'this', which could not be resolved
    new Test_edby60().f();
    Test_edby60 t = new Test_edby60();
    // BUG: Diagnostic contains: guarded by 't'
    t.f();
  }
}

