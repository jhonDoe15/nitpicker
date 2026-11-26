package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;

record S26Rec(@GuardedBy("lock") int a, @GuardedBy("missing") int b, Object lock) {
  void m() {
    int x = a;
    x = b;
    synchronized (lock) {
      x = a;
    }
    x = a();
    synchronized (lock) {
      x = a();
    }
  }
}

record S26Rec2(@GuardedBy("lock") int a, Object lock) {
  public int a() {
    return 0;
  }
}

record S26Rec3(@GuardedBy("LOCK") int a, @GuardedBy("this") int b) {
  static final Object LOCK = new Object();

  void m() {
    int x = a;
    x = b;
    synchronized (LOCK) {
      x = a;
    }
    synchronized (this) {
      x = b;
    }
  }
}

class S26RecUse {
  void m(S26Rec r, S26Rec2 q, S26Rec3 t) {
    int x = r.a();
    x = q.a();
    synchronized (r.lock()) {
      x = r.a();
    }
    x = t.a();
    x = t.b();
    synchronized (t) {
      x = t.b();
    }
  }
}

class S26Names {
  static final String LOCK = "lock";
  static final String PRE = "lo";
  static final String AB = PRE + "ck";
  static final String NUM = "a" + 1;
  static final String MIX = 1 + 2 + "x";
  static final String CH = "a" + 'b';
  static final String FLAG = "a" + true;
  static final String PAREN = ("lo" + "ck");

  interface Holder {
    String NAME = "lock";
  }

  static class Nested {
    static final String NAME = "lock";
  }
}

class S26ConstBase {
  static final String BASE_NAME = "lock";
}

class S26Const extends S26ConstBase implements S26Names.Holder {
  final Object lock = new Object();
  final Object a1 = new Object();
  final Object xy = new Object();
  final Object a1b = new Object();
  final Object x3 = new Object();
  static final String LOCAL = "lock";
  static final String TWICE = LOCAL;

  @GuardedBy(LOCAL)
  int a;

  @GuardedBy(S26Names.LOCK)
  int b;

  @GuardedBy(S26Names.AB)
  int c;

  @GuardedBy(S26Names.PRE + "ck")
  int d;

  @GuardedBy("lo" + "ck")
  int e;

  @GuardedBy(NAME)
  int f;

  @GuardedBy(BASE_NAME)
  int g;

  @GuardedBy(S26Names.Nested.NAME)
  int h;

  @GuardedBy(TWICE)
  int i;

  @GuardedBy(S26Names.NUM)
  int j;

  @GuardedBy(S26Names.MIX)
  int k;

  @GuardedBy(S26Names.CH)
  int l;

  @GuardedBy(S26Names.PAREN)
  int m;

  @GuardedBy(S26Names.LOCK + "")
  int n;

  @GuardedBy(value = S26Names.LOCK)
  int o;

  @GuardedBy(S26Names.FLAG)
  int p;

  @GuardedBy(S26Names.Holder.NAME)
  int q;

  void use() {
    int x = a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q;
    synchronized (lock) {
      x = a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q;
    }
  }
}

class S26Owner {
  final Object mu = new Object();
  static Object sh = new Object() {
    @GuardedBy("sh")
    int y;

    void f() {
      y++;
    }
  };
  Object own = new Object() {
    @GuardedBy("own")
    int z;

    void f() {
      z++;
    }
  };

  Object lm() {
    class Local {
      @GuardedBy("lm")
      int x;

      @GuardedBy("mu")
      int w;

      void use() {
        x++;
        w++;
        synchronized (lm()) {
          x++;
        }
      }
    }
    return mu;
  }

  static void sm() {
    class Local2 {
      @GuardedBy("sm")
      int x;

      void use() {
        x++;
      }
    }
  }
}

class S26Over {
  Object lock() {
    return null;
  }

  Object lock(int x) {
    return null;
  }

  @GuardedBy("lock()")
  int a;

  void m() {
    a++;
    synchronized (lock()) {
      a++;
    }
    synchronized (lock(1)) {
      a++;
    }
  }
}

class S26Over2 {
  Object lock(int x) {
    return null;
  }

  Object lock() {
    return null;
  }

  @GuardedBy("lock()")
  int a;

  void m() {
    a++;
    synchronized (lock()) {
      a++;
    }
    synchronized (lock(1)) {
      a++;
    }
  }
}

class S26OverBase {
  Object lock() {
    return null;
  }
}

class S26OverSub extends S26OverBase {
  Object lock(String s) {
    return null;
  }

  @GuardedBy("lock()")
  int a;

  void m() {
    a++;
    synchronized (lock()) {
      a++;
    }
  }
}

class S26HideBase {
  final Object mu = new Object();
  int guarded;
}

class S26HideSub extends S26HideBase {
  final Object mu = new Object();

  @GuardedBy("mu")
  int own;

  @GuardedBy("super.mu")
  int viaSuper;

  void m() {
    own++;
    viaSuper++;
    synchronized (mu) {
      own++;
      viaSuper++;
    }
    synchronized (super.mu) {
      own++;
      viaSuper++;
    }
    synchronized (this.mu) {
      own++;
    }
  }

  class In {
    @GuardedBy("mu")
    int w;

    @GuardedBy("S26HideSub.this.mu")
    int v;

    void f() {
      w++;
      v++;
      synchronized (mu) {
        w++;
        v++;
      }
    }
  }
}

class S26Supers {
  final Object mu = new Object();

  @GuardedBy("Outer.super.mu")
  int a;

  @GuardedBy("super.mu")
  int b;

  @GuardedBy("S26Supers.super.mu")
  int c;

  @GuardedBy("S26Supers.super.toString()")
  int d;

  @GuardedBy("super.toString()")
  int f;

  @GuardedBy("this.super.mu")
  int g;

  void m() {
    a++;
    b++;
    c++;
    d++;
    f++;
    g++;
  }
}

record S26RecGen<T>(@GuardedBy("lock") T item, @GuardedBy("lock") int... more) {
  static final Object lock = new Object();

  void m() {
    T t = item;
    int[] x = more;
    synchronized (lock) {
      t = item;
    }
  }

  record Nested(@GuardedBy("OUT") int a, @GuardedBy("nothing") int b) {
    static final Object OUT = new Object();
  }
}

class S26RecLocal {
  void m() {
    record Local(@GuardedBy("lock") int a, Object lock) {
      void f() {
        int x = a;
      }
    }
    record Local2(@GuardedBy("zzz") int a) {}
  }
}

class S26StaticBase {
  static Object sl() {
    return null;
  }

  Object il() {
    return null;
  }
}

class S26StaticSub extends S26StaticBase {
  static Object sl() {
    return null;
  }

  @GuardedBy("sl()")
  int a;

  @GuardedBy("S26StaticBase.sl()")
  int b;

  @GuardedBy("il()")
  int c;

  void m() {
    a++;
    b++;
    c++;
    synchronized (sl()) {
      a++;
      b++;
    }
    synchronized (S26StaticBase.sl()) {
      a++;
      b++;
    }
    synchronized (il()) {
      c++;
    }
    synchronized (this.il()) {
      c++;
    }
    synchronized (super.il()) {
      c++;
    }
  }
}
