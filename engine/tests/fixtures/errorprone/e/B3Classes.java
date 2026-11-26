package e;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

class B3Tpq<E extends Enum<E>, N extends Number> {
  void run(Class<E> type, List<N> numbers) {
    Function<E, String> name = E::name;
    Function<N, Integer> value = N::intValue;
    Function<E, String> ok = Enum::name;
    numbers.stream().map(N::intValue);
  }
}

class B3Throw {
  static class A extends Exception {
    @Override
    public String toString() {
      return "a";
    }
  }

  static class B extends RuntimeException {
    @Override
    public String toString() {
      return "b";
    }

    @Override
    public String getMessage() {
      return "m";
    }
  }

  static class C {
    @Override
    public String toString() {
      return "c";
    }
  }

  static class D extends Error {
    String toString(int x) {
      return "d";
    }

    @Override
    public synchronized String toString() {
      return "d";
    }
  }

  Object anonymous() {
    return new IOException() {
      @Override
      public String toString() {
        return "anon";
      }
    };
  }
}

class B3Resources {
  interface Res extends AutoCloseable {
    @Override
    void close();
  }

  final Res field = null;
  Res plain;

  void run(Res param, Res reassigned) {
    Res local = param;
    Res changing = param;
    changing = reassigned;
    reassigned = null;
    try (Res a = param) {
      a.close();
    }
    try (Res b = local; Res c = field) {
      b.close();
      c.close();
    }
    try (Res d = changing) {
      d.close();
    }
    try (Res e = reassigned) {
      e.close();
    }
    try (Res f = plain) {
      f.close();
    }
    try (final Res g = param) {
      g.close();
    }
    try (param) {
    }
  }
}

class B3Volatile {
  volatile int count;
  volatile long total;
  int plain;
  volatile boolean flag;
  static volatile int shared;
  volatile int[] array = new int[1];

  void run(B3Volatile other) {
    count++;
    ++count;
    count--;
    --count;
    count += 2;
    count -= 2;
    count *= 2;
    count = count + 1;
    count = count - 1;
    count = 1 + count;
    count = (count + 1);
    count = count * 2;
    total = total + count;
    plain++;
    plain = plain + 1;
    this.count++;
    other.count++;
    other.count = other.count + 1;
    this.count = count + 1;
    shared++;
    B3Volatile.shared++;
    flag = !flag;
    array[0]++;
    synchronized (this) {
      count++;
      count += 1;
    }
  }

  synchronized void sync() {
    count++;
  }

  void lambda() {
    Runnable r = () -> count++;
    synchronized (this) {
      Runnable q = () -> count++;
    }
  }
}

class B3Static<T> {
  int field;
  static int staticField;
  T value;

  class Plain {}

  class UsesField {
    int get() {
      return field;
    }
  }

  class UsesStaticField {
    int get() {
      return staticField;
    }
  }

  class UsesType {
    T get() {
      return null;
    }
  }

  class UsesOuterThis {
    Object get() {
      return B3Static.this;
    }
  }

  class UsesOuterMethod {
    int get() {
      return outerMethod();
    }
  }

  int outerMethod() {
    return 1;
  }

  static int staticMethod() {
    return 1;
  }

  class UsesStaticMethod {
    int get() {
      return staticMethod();
    }
  }

  class Sibling {}

  class UsesSibling {
    Sibling s;
  }

  class CreatesSibling {
    Object make() {
      return new Sibling();
    }
  }

  class Generic<U> {
    U u;

    <V> V convert(V v) {
      return v;
    }
  }

  class Extends extends Sibling {}

  static class AlreadyStatic {}

  private class PrivateInner {}

  @SuppressWarnings("ClassCanBeStatic")
  class Suppressed {}

  class WithAnnotation {
    @Deprecated
    int x;
  }

  class Nested {
    class Deeper {}
  }

  void local() {
    class Local {}
    Object o = new Object() {
      class InAnonymous {}
    };
  }

  enum E {
    A;

    class InEnum {}
  }

  interface I {
    class InInterface {}
  }

  class Own {
    Own next;
    Own self() {
      return new Own();
    }
  }
}

class B3Plain {
  class Inner {}

  class Another {
    Inner inner;
  }

  class Uses {
    void run() {
      new Inner();
    }
  }

  int x;

  class Reads {
    int read() {
      return x;
    }
  }

  class Calls {
    void run() {
      toString();
      hashCode();
    }
  }

  class InheritedCall extends ArrayList<String> {
    void run() {
      size();
      add("x");
    }
  }

  class RunnableHolder implements Runnable {
    public void run() {
      Runnable r = () -> {};
    }
  }
}
