package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;
import java.util.List;
import s26pkg.Lib;

class S26Calls {
  final Object mu = new Object();
  Object field = new Object();

  @GuardedBy("lock")
  void one(Object lock) {}

  @GuardedBy("a")
  void first(Object a, Object b) {}

  @GuardedBy("b")
  void second(Object a, Object b) {}

  @GuardedBy("xs")
  void varargs(Object... xs) {}

  @GuardedBy("this")
  void self() {}

  @GuardedBy("mu")
  void viaField() {}

  @GuardedBy("itself")
  int itself;

  @GuardedBy("itself")
  void itselfMethod() {}

  @GuardedBy("getMu()")
  int viaGetter;

  @GuardedBy("getMu(1)")
  int withArgs;

  @GuardedBy("getOther().mu")
  int chained;

  Object getMu() {
    return mu;
  }

  S26Calls getOther() {
    return this;
  }

  void calls(Object local, S26Calls other) {
    one(local);
    synchronized (local) {
      one(local);
      first(local, null);
      second(null, local);
      first(null, local);
    }
    synchronized (field) {
      one(field);
      one(this.field);
      one(other.field);
      one(this);
    }
    synchronized (this) {
      one(this);
      self();
      other.self();
      viaField();
    }
    synchronized (mu) {
      viaField();
      other.viaField();
      one(mu);
    }
    synchronized (other.mu) {
      other.viaField();
    }
    one(null);
    one("x");
    one(getMu());
    varargs();
    varargs(local);
    varargs(local, local);
    synchronized (local) {
      varargs(local);
    }
  }

  void itselfs() {
    itself++;
    itselfMethod();
  }

  void getters() {
    viaGetter++;
    synchronized (getMu()) {
      viaGetter++;
      chained++;
    }
    synchronized (this.getMu()) {
      viaGetter++;
    }
    synchronized (mu) {
      viaGetter++;
    }
    synchronized (getOther().mu) {
      chained++;
    }
    withArgs++;
  }

  void other(Lib lib) {
    lib.guarded++;
    synchronized (lib.mu) {
      lib.guarded++;
      lib.self++;
    }
    synchronized (lib) {
      lib.self++;
    }
    Lib.staticGuarded++;
    synchronized (Lib.LOCK) {
      Lib.staticGuarded++;
      Lib.Inner x = null;
    }
    lib.withParam(lib);
    synchronized (lib) {
      lib.withParam(lib);
    }
    Lib.classGuarded();
    synchronized (Lib.class) {
      Lib.classGuarded();
    }
    lib.viaMethod++;
    synchronized (lib.getMu()) {
      lib.viaMethod++;
    }
  }
}

class S26Sub2 extends Lib {
  void m() {
    prot++;
    synchronized (mu) {
      prot++;
      guarded++;
    }
    synchronized (this) {
      self++;
    }
  }
}

class S26Same extends s26pkg.Lib {
  void m(S26Same s) {
    s.prot++;
    synchronized (s.mu) {
      s.prot++;
    }
  }
}

class S26Inits {
  final Object mu = new Object();

  @GuardedBy("mu")
  int a;

  int b = a;
  Runnable r = () -> a++;
  Runnable r2 = new Runnable() {
    public void run() {
      a++;
    }
  };

  {
    a++;
  }

  static {
    new S26Inits().a++;
  }

  S26Inits() {
    a++;
    Runnable q = () -> a++;
  }

  void m() {
    Object o = new Object() {
      @Override
      public String toString() {
        return "" + a;
      }
    };
  }
}
