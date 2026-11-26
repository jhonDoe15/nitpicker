package e;

import static com.google.common.base.Preconditions.checkNotNull;

import com.google.common.base.Preconditions;

class S9CheckNotNull {
  private final Object field = new Object();
  private Object mutable = new Object();

  void twice(Object a) {
    checkNotNull(a);
    checkNotNull(a);
  }

  void thrice(Object a, Object b) {
    checkNotNull(a);
    checkNotNull(b);
    checkNotNull(a, "msg");
    Preconditions.checkNotNull(a);
    checkNotNull(b, "msg %s", 1);
  }

  void once(Object a, Object b) {
    checkNotNull(a);
    checkNotNull(b);
  }

  void valueUsed(Object a) {
    Object x = checkNotNull(a);
    Object y = checkNotNull(a);
    checkNotNull(a);
  }

  void inIf(Object a, boolean b) {
    checkNotNull(a);
    if (b) {
      checkNotNull(a);
    }
    switch (1) {
      case 1:
        checkNotNull(a);
        break;
      default:
        checkNotNull(a);
    }
  }

  void inLambda(Object a) {
    checkNotNull(a);
    Runnable r = () -> checkNotNull(a);
    Runnable q = () -> {
      checkNotNull(a);
    };
  }

  void inClass(Object a) {
    checkNotNull(a);
    new Object() {
      void f() {
        checkNotNull(a);
      }
    };
  }

  void inTry(Object a) {
    try {
      checkNotNull(a);
      checkNotNull(a);
    } catch (RuntimeException e) {
      checkNotNull(a);
    } finally {
      checkNotNull(a);
    }
  }

  void inTry2(Object a) {
    try {
      checkNotNull(a);
    } catch (RuntimeException e) {
      checkNotNull(a);
    }
  }

  void notFinal(Object a) {
    checkNotNull(a);
    a = new Object();
    checkNotNull(a);
  }

  void fields() {
    checkNotNull(field);
    checkNotNull(field);
    checkNotNull(mutable);
    checkNotNull(mutable);
  }

  void qualified() {
    checkNotNull(this.field);
    checkNotNull(this.field);
  }

  void loops(Object a) {
    for (int i = 0; i < 2; i++) {
      checkNotNull(a);
    }
    while (true) {
      checkNotNull(a);
      break;
    }
    checkNotNull(a);
  }

  void block(Object a) {
    {
      checkNotNull(a);
    }
    {
      checkNotNull(a);
    }
  }

  void expression(Object a) {
    checkNotNull(a).toString();
    checkNotNull(a);
    checkNotNull(a);
  }

  void calls(Object a) {
    checkNotNull(a.toString());
    checkNotNull(a.toString());
  }

  void swit(Object a, int k) {
    int r = switch (k) {
      case 1 -> {
        checkNotNull(a);
        yield 1;
      }
      default -> 0;
    };
    checkNotNull(a);
  }

  void sync(Object a) {
    synchronized (this) {
      checkNotNull(a);
    }
    checkNotNull(a);
  }

  @SuppressWarnings("CheckNotNullMultipleTimes")
  void suppressed(Object a) {
    checkNotNull(a);
    checkNotNull(a);
  }

  void effectivelyFinalInLoop(java.util.List<Object> list) {
    for (Object a : list) {
      checkNotNull(a);
      checkNotNull(a);
    }
  }

  void two(Object a, Object b) {
    checkNotNull(a);
    checkNotNull(b);
    checkNotNull(b);
    checkNotNull(a);
  }

  void localVar() {
    Object local = new Object();
    checkNotNull(local);
    checkNotNull(local);
  }

  void incremented(Object a) {
    checkNotNull(a);
    Runnable r = () -> {};
    checkNotNull(a);
  }

  void other(Object a) {
    java.util.Objects.requireNonNull(a);
    java.util.Objects.requireNonNull(a);
  }
}
