package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;

class S26Owner2 {
  final Object mu = new Object();

  {
    Object o = new Object() {
      @GuardedBy("mu")
      int a;

      void f() {
        a++;
      }
    };
  }

  static {
    Object o = new Object() {
      @GuardedBy("mu")
      int b;

      void f() {
        b++;
      }
    };
  }

  S26Owner2() {
    class C {
      @GuardedBy("mu")
      int c;

      void f() {
        c++;
      }
    }
  }

  Runnable r = () -> {
    class D {
      @GuardedBy("r")
      int d;

      void f() {
        d++;
      }
    }
  };

  static Runnable sr = () -> {
    class D2 {
      @GuardedBy("sr")
      int d;

      void f() {
        d++;
      }
    }
  };

  Object holder = new Object() {
    class Deep {
      @GuardedBy("holder")
      int e;

      void f() {
        e++;
      }
    }
  };

  enum E {
    ONE {
      @GuardedBy("ONE")
      int g;

      void h() {
        g++;
      }
    };

    void h() {}
  }

  void deep() {
    class Outer3 {
      void inner() {
        class Inner3 {
          @GuardedBy("deep")
          int x;

          @GuardedBy("inner")
          int y;

          @GuardedBy("Outer3")
          int z;

          @GuardedBy("S26Owner2")
          int w;

          void f() {
            x++;
            y++;
            z++;
            w++;
          }
        }
      }
    }
  }

  Object lockQ() {
    return mu;
  }

  private Object lockQ(int x) {
    return mu;
  }

  private Object lockS() {
    return mu;
  }

  Object lockS(int x) {
    return mu;
  }

  @GuardedBy("lockQ()")
  int q;

  @GuardedBy("lockS()")
  int s;

  void use() {
    q++;
    s++;
    synchronized (lockQ()) {
      q++;
    }
    synchronized (lockS()) {
      s++;
    }
    synchronized (lockQ(1)) {
      q++;
    }
    synchronized (lockS(1)) {
      s++;
    }
  }
}

class S26Pack {
  @GuardedBy("e")
  int a;

  @GuardedBy("S26Pack")
  int b;

  void f() {
    a++;
    b++;
  }
}
