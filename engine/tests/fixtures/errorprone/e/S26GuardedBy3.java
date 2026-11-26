package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;

// test: enclosingSuperAccess


class A_edby25 {
  final Object lock = new Object();

  @GuardedBy("lock")
  boolean flag = false;
}

class B_edby25 extends A_edby25 {
  void m() {
    new Object() {
      @GuardedBy("lock")
      void n() {
        flag = true;
      }
    };
  }
}

// test: superAccess_this


class A_edby26 {
  final Object lock = new Object();

  @GuardedBy("this")
  boolean flag = false;
}

class B_edby26 extends A_edby26 {
  synchronized void m() {
    flag = true;
  }
}

// test: superAccess_lock


class A_edby27 {
  final Object lock = new Object();

  @GuardedBy("lock")
  boolean flag = false;
}

class B_edby27 extends A_edby27 {
  void m() {
    synchronized (lock) {
      flag = true;
    }
    synchronized (this.lock) {
      flag = true;
    }
  }
}

// test: superAccess_staticLock


class A_edby28 {
  static final Object lock = new Object();

  @GuardedBy("lock")
  static boolean flag = false;
}

class B_edby28 extends A_edby28 {
  void m() {
    synchronized (A_edby28.lock) {
      flag = true;
    }
    synchronized (B_edby28.lock) {
      flag = true;
    }
  }
}

// test: otherClass_bad_staticLock


class A_edby29 {
  static final Object lock = new Object();

  @GuardedBy("lock")
  static boolean flag = false;
}

class B_edby29 {
  static final Object lock = new Object();

  @GuardedBy("lock")
  static boolean flag = false;

  void m() {
    synchronized (B_edby29.lock) {
      // BUG: Diagnostic contains:
      // should be guarded by 'A_edby29.lock'
      A_edby29.flag = true;
    }
    synchronized (A_edby29.lock) {
      // BUG: Diagnostic contains:
      // should be guarded by 'B_edby29.lock'
      B_edby29.flag = true;
    }
  }
}

// test: otherClass_bad_staticLock_alsoSub


class A_edby30 {
  static final Object lock = new Object();

  @GuardedBy("lock")
  static boolean flag = false;
}

class B_edby30 extends A_edby30 {
  static final Object lock = new Object();

  @GuardedBy("lock")
  static boolean flag = false;

  void m() {
    synchronized (B_edby30.lock) {
      // BUG: Diagnostic contains:
      // should be guarded by 'A_edby30.lock'
      A_edby30.flag = true;
    }
    synchronized (A_edby30.lock) {
      // BUG: Diagnostic contains:
      // should be guarded by 'B_edby30.lock'
      B_edby30.flag = true;
    }
  }
}

// test: otherClass_staticLock


class A_edby31 {
  static final Object lock = new Object();

  @GuardedBy("lock")
  static boolean flag = false;
}

class B_edby31 {
  void m() {
    synchronized (A_edby31.lock) {
      A_edby31.flag = true;
    }
  }
}

// test: instanceAccess_instanceGuard


class InstanceAccess_InstanceGuard_edby32 {
  class A {
    final Object lock = new Object();

    @GuardedBy("lock")
    int x;
  }

  class B extends A {
    void m() {
      synchronized (this.lock) {
        this.x++;
      }
      // BUG: Diagnostic contains:
      // should be guarded by 'this.lock'
      this.x++;
    }
  }
}

// test: instanceAccess_lexicalGuard


class InstanceAccess_LexicalGuard_edby33 {
  class Outer {
    final Object lock = new Object();

    class Inner {
      @GuardedBy("lock")
      int x;

      void m() {
        synchronized (Outer.this.lock) {
          this.x++;
        }
        // BUG: Diagnostic contains:
        // should be guarded by 'Outer.this.lock'
        this.x++;
      }
    }
  }
}

// test: lexicalAccess_instanceGuard


class LexicalAccess_InstanceGuard_edby34 {
  class Outer {
    final Object lock = new Object();

    @GuardedBy("lock")
    int x;

    class Inner {
      void m() {
        synchronized (Outer.this.lock) {
          Outer.this.x++;
        }
        // BUG: Diagnostic contains:
        // should be guarded by 'Outer.this.lock'
        Outer.this.x++;
      }
    }
  }
}

// test: lexicalAccess_lexicalGuard


class LexicalAccess_LexicalGuard_edby35 {
  class Outer {
    final Object lock = new Object();

    class Inner {
      @GuardedBy("lock")
      int x;

      class InnerMost {
        void m() {
          synchronized (Outer.this.lock) {
            Inner.this.x++;
          }
          // BUG: Diagnostic contains:
          // should be guarded by 'Outer.this.lock'
          Inner.this.x++;
        }
      }
    }
  }
}

// test: instanceAccess_thisGuard


class InstanceAccess_ThisGuard_edby36 {
  class A {
    @GuardedBy("this")
    int x;
  }

  class B extends A {
    void m() {
      synchronized (this) {
        this.x++;
      }
      // BUG: Diagnostic contains:
      // should be guarded by 'this'
      this.x++;
    }
  }
}

