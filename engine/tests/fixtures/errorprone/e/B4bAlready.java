package e;

import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;

public class B4bAlready {
  private final boolean flag = true;
  private boolean mutable;
  final String name = "n";
  final List<String> items = null;
  Object value;

  void ifThen(boolean a, boolean b) {
    if (a) {
      if (a) {
        System.out.println();
      }
      if (!a) {
        System.out.println();
      }
      boolean c = a && b;
    } else {
      if (a) {
        System.out.println();
      }
    }
  }

  void notEquals(String s, Object o) {
    if (s != null) {
      if (s == null) {
        return;
      }
      if (s != null) {
        return;
      }
    }
    if (o == null) {
      if (o == null) {
        return;
      }
    } else {
      if (o != null) {
        return;
      }
    }
  }

  void early(boolean a, String s) {
    if (a) {
      return;
    }
    if (a) {
      System.out.println();
    }
    if (s == null) {
      throw new IllegalStateException();
    }
    boolean b = s == null;
  }

  void earlyElse(boolean a) {
    if (!a) {
      System.out.println();
    } else {
      return;
    }
    boolean b = a;
  }

  void conjunction(boolean a, boolean b, boolean c) {
    if (a && b) {
      boolean x = a;
      boolean y = b;
      boolean z = c;
    }
    if (!(a || b)) {
      boolean x = a;
    }
    if (a || b) {
      boolean x = a;
    }
  }

  void ternary(boolean a) {
    boolean r = a ? a : false;
    boolean s = a ? true : a;
  }

  void notFinal(boolean a) {
    boolean local = true;
    if (local) {
      boolean b = local;
    }
    boolean changed = true;
    changed = false;
    if (changed) {
      boolean b = changed;
    }
    if (mutable) {
      boolean b = mutable;
    }
    if (flag) {
      boolean b = flag;
    }
    boolean param = a;
    a = false;
    if (a) {
      boolean b = a;
    }
  }

  void methods(String s, List<String> list) {
    if (s.isEmpty()) {
      boolean b = s.isEmpty();
    }
    if (list.isEmpty()) {
      boolean b = list.isEmpty();
    }
    if (s.startsWith("a")) {
      boolean b = s.startsWith("a");
      boolean c = s.startsWith("b");
    }
    if (s.equals("x")) {
      boolean b = "x".equals(s);
      boolean c = s.equals("x");
    }
    if (Objects.equals(s, "y")) {
      boolean b = Objects.equals(s, "y");
    }
  }

  void fields() {
    if (flag) {
      boolean b = flag;
      boolean c = this.flag;
    }
    if (this.flag) {
      boolean b = flag;
      boolean c = this.flag;
    }
    if (name == null) {
      boolean b = name == null;
    }
    if (items == null) {
      boolean b = items == null;
    }
  }

  void numbers(int i, long l) {
    if (i == 1) {
      boolean b = i == 1;
      boolean c = 1 == i;
      boolean d = i == 2;
    }
    if (l == 1L) {
      boolean b = l == 1L;
      boolean c = l == 1;
    }
  }

  void lambdas(boolean a) {
    if (a) {
      Supplier<Boolean> s = () -> a;
      Runnable r = () -> {
        if (a) {
          System.out.println();
        }
      };
    }
  }

  void callArgument(boolean a) {
    if (a) {
      System.out.println(a);
      System.out.println(!a);
      new StringBuilder().append(a);
    }
  }

  void assignment(boolean a) {
    boolean other = false;
    if (other) {
      other = false;
    }
  }

  void arrays(int[] array) {
    if (array.length == 0) {
      boolean b = array.length == 0;
    }
  }

  void boxed(Boolean a) {
    if (a) {
      boolean b = a;
    }
  }

  void whileLoop(boolean a) {
    if (a) {
      while (a) {
        break;
      }
    }
  }

  void nestedMethod(boolean a) {
    if (a) {
      Object o = new Object() {
        boolean m() { return a; }
      };
    }
  }

  void failed(boolean a, boolean b) {
    if (a != b) {
      boolean x = a;
    }
    if (a & b) {
      boolean x = a;
    }
  }

  @SuppressWarnings("AlreadyChecked")
  void suppressed(boolean a) {
    if (a) {
      boolean b = a;
    }
  }

  void earlyNested(boolean a, boolean b) {
    if (a) {
      if (b) {
        return;
      }
      boolean c = b;
    }
    boolean d = b;
    for (int i = 0; i < 2; i++) {
      if (a) {
        return;
      }
    }
    boolean e = a;
  }

  boolean earlyLambda(boolean a) {
    Supplier<Boolean> s = () -> {
      if (a) {
        return false;
      }
      return a;
    };
    return a;
  }

  void classBased(Class<?> c, Object o) {
    if (c.isInstance(o)) {
      boolean b = c.isInstance(o);
    }
  }

  void enumConstant(Thread.State state) {
    if (state == Thread.State.NEW) {
      boolean b = state == Thread.State.NEW;
    }
  }

  void arrayAccess(boolean[] flags, boolean f) {
    if (flags[0]) {
      boolean b = flags[0];
    }
  }

  void parenthesized(boolean a) {
    if ((a)) {
      boolean b = (a);
      boolean c = a;
    }
  }

  void instanceOfCase(Object o) {
    if (o instanceof String s) {
      boolean b = o instanceof String;
    }
  }
}
