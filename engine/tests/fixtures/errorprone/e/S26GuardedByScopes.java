package e;

import com.google.common.collect.Iterables;
import com.google.common.util.concurrent.Monitor;
import com.google.errorprone.annotations.concurrent.GuardedBy;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.Supplier;

class S26Scopes {
  final Object mu = new Object();
  final Monitor monitor = new Monitor();

  @GuardedBy("mu")
  int a;

  @GuardedBy("this")
  int self;

  @GuardedBy("mu")
  int get() {
    return a;
  }

  void lambdas(Optional<String> opt, List<String> list, Map<String, String> map, Iterator<String> it) {
    synchronized (mu) {
      Runnable r = () -> a++;
      opt.ifPresent(x -> a++);
      opt.map(x -> a);
      list.forEach(x -> a++);
      list.replaceAll(x -> x + a);
      map.forEach((k, v) -> a++);
      map.computeIfAbsent("k", k -> "v" + a);
      it.forEachRemaining(x -> a++);
      Iterables.any(list, x -> a > 0);
      Iterables.tryFind(list, x -> a > 0);
      Supplier<Integer> s = () -> a;
      Consumer<String> c = x -> {
        synchronized (mu) {
          a++;
        }
      };
      Consumer<String> d = x -> {
        a++;
      };
    }
    opt.ifPresent(x -> a++);
    list.stream().forEach(x -> a++);
    opt.get();
  }

  @GuardedBy("mu")
  void accept(S26Scopes s) {}

  void memberRefs(List<S26Scopes> list) {
    synchronized (mu) {
      list.forEach(this::accept);
      list.forEach(S26Scopes::bump);
      Consumer<S26Scopes> s = this::accept;
      Supplier<Integer> u = this::get;
    }
    list.forEach(this::accept);
    Supplier<Integer> t = this::get;
  }

  static void bump(S26Scopes s) {}

  void anonymous() {
    synchronized (mu) {
      new Runnable() {
        @Override
        public void run() {
          a++;
        }
      }.run();
      Object o = new Object() {
        int f = a;
        int g() {
          return a;
        }
      };
    }
  }

  void local() {
    synchronized (mu) {
      class Local {
        int f = a;

        int g() {
          return a;
        }

        Local() {
          a++;
        }
      }
    }
    class Local2 {
      void h() {
        a++;
      }
    }
  }

  void guardAnon() {
    new Monitor.Guard(monitor) {
      @Override
      public boolean isSatisfied() {
        return false;
      }

      void h() {
        a++;
      }
    };
  }

  class Inner {
    @GuardedBy("mu")
    int ia;

    @GuardedBy("Inner.this")
    int ib;

    @GuardedBy("S26Scopes.this")
    int ic;

    void m() {
      synchronized (mu) {
        a++;
        ia++;
      }
      synchronized (S26Scopes.this.mu) {
        ia++;
        a++;
      }
      synchronized (this) {
        ib++;
      }
      synchronized (S26Scopes.this) {
        ic++;
        self++;
      }
      a++;
      ia++;
      ib++;
      ic++;
    }

    void other(Inner i, S26Scopes s) {
      i.ia++;
      s.a++;
      synchronized (s.mu) {
        s.a++;
        i.ia++;
      }
    }
  }

  static class Nested {
    @GuardedBy("NMU")
    int na;

    static final Object NMU = new Object();

    void m(S26Scopes s) {
      s.a++;
      synchronized (NMU) {
        na++;
      }
      na++;
    }
  }

  interface Iface {
    Object LOCK = new Object();
  }

  static class Impl implements Iface {
    @GuardedBy("LOCK")
    int x;

    void m() {
      synchronized (LOCK) {
        x++;
      }
      x++;
    }
  }

  enum E {
    A,
    B;

    final Object mu = new Object();

    @GuardedBy("mu")
    int count;

    void m() {
      count++;
      synchronized (mu) {
        count++;
      }
    }
  }
}

class S26Super {
  final Object lock = new Object();

  @GuardedBy("lock")
  protected int x;

  @GuardedBy("lock")
  protected void guarded() {}
}

class S26Sub extends S26Super {
  void m() {
    x++;
    synchronized (lock) {
      x++;
      guarded();
      this.guarded();
      super.guarded();
    }
    guarded();
    super.x++;
    this.x++;
  }

  void n(S26Super other) {
    synchronized (other.lock) {
      other.x++;
      x++;
    }
    synchronized (this) {
      x++;
    }
  }
}

class S26Generic<T> {
  final Object mu = new Object();

  @GuardedBy("mu")
  T value;

  @GuardedBy("mu")
  List<T> items = new ArrayList<>();

  void m(S26Generic<String> other) {
    value = null;
    synchronized (mu) {
      value = null;
      items.size();
    }
    other.value = null;
    synchronized (other.mu) {
      other.value = "";
    }
    items.size();
  }
}

class S26Resources {
  final Object mu = new Object();

  @GuardedBy("mu")
  final AutoCloseable closer = null;

  @GuardedBy("mu")
  int a;

  void m() throws Exception {
    try (AutoCloseable c = closer) {
      a++;
    }
    synchronized (mu) {
      try (AutoCloseable c = closer) {
        a++;
      }
    }
    try (closer) {
      a++;
    }
  }
}
