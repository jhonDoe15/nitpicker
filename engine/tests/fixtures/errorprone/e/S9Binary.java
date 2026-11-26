package e;

import static java.lang.Double.NaN;

import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.IntConsumer;

class S9ThisNull {
  boolean a() {
    return this == null;
  }

  boolean b() {
    return this != null;
  }

  boolean c() {
    return null == this;
  }

  boolean d(Object o) {
    return o == null || this.equals(o);
  }

  boolean e() {
    return (this) == null;
  }

  class Inner {
    boolean f() {
      return S9ThisNull.this == null;
    }

    boolean g() {
      return this == null;
    }
  }

  @SuppressWarnings("ComparingThisWithNull")
  boolean suppressed() {
    return this == null;
  }
}

class S9EqualsNaN {
  boolean run(double d, float f, Double boxed) {
    boolean a = d == Double.NaN;
    boolean b = d != Double.NaN;
    boolean c = Double.NaN == d;
    boolean x = f == Float.NaN;
    boolean y = f != Float.NaN;
    boolean z = Float.NaN != f;
    boolean w = d == NaN;
    boolean v = d == java.lang.Double.NaN;
    boolean u = boxed == Double.NaN;
    boolean t = Double.NaN == Double.NaN;
    boolean s = d + 1 == Double.NaN;
    boolean r = d < Double.NaN;
    boolean q = d == Double.POSITIVE_INFINITY;
    boolean p = d == S9Other.NaN;
    boolean o = Double.isNaN(d);
    boolean n = (d) == (Double.NaN);
    return a || b || c || x || y || z || w || v || u || t || s || r || q || p || o || n;
  }

  @SuppressWarnings("EqualsNaN")
  boolean suppressed(double d) {
    return d == Double.NaN;
  }
}

class S9Other {
  static final double NaN = 0.0;
}

class S9DiscardedPostfix {
  void run() {
    IntConsumer a = x -> x++;
    IntConsumer b = x -> x--;
    IntConsumer c = x -> ++x;
    IntConsumer d = x -> {
      x++;
    };
    Function<Integer, Integer> e = x -> x++;
    java.util.function.BiFunction<Integer, Integer, Integer> f = (x, y) -> y--;
    int outer = 0;
    Runnable g = () -> outer();
    Consumer<int[]> h = arr -> arr[0]++;
    IntConsumer i = (int x) -> x++;
    int[] counter = {0};
    IntConsumer j = x -> counter[0]++;
  }

  void outer() {}

  @SuppressWarnings("DiscardedPostfixExpression")
  void suppressed() {
    IntConsumer a = x -> x++;
  }
}

class S9DeadThread {
  void run(Runnable r) {
    new Thread(r);
    new Thread();
    new Thread(r, "name");
    Thread t = new Thread(r);
    new Thread(r).start();
    Object o = new Thread(r);
    new S9DeadThread() {};
    new Thread(r) {};
    java.util.List<Thread> l = java.util.List.of(new Thread(r));
  }

  @SuppressWarnings("DeadThread")
  void suppressed(Runnable r) {
    new Thread(r);
  }
}

class S9EqualsRef {
  int value;

  @Override
  public boolean equals(Object o) {
    return this.equals(o);
  }

  static class Direct {
    @Override
    public boolean equals(Object o) {
      return equals(o);
    }
  }

  static class Fine {
    @Override
    public boolean equals(Object o) {
      return this == o;
    }
  }

  static class Reversed {
    @Override
    public boolean equals(Object o) {
      return o.equals(this);
    }
  }

  static class Other {
    @Override
    public boolean equals(Object o) {
      return equals(o, 1);
    }

    boolean equals(Object o, int x) {
      return true;
    }
  }

  static class Nested {
    @Override
    public boolean equals(Object o) {
      if (o instanceof Nested) {
        return this.equals(o);
      }
      return false;
    }
  }

  static class Another {
    public boolean equals(Another o) {
      return this.equals(o);
    }
  }

  static class OtherArg {
    @Override
    public boolean equals(Object o) {
      Object p = o;
      return this.equals(p);
    }
  }

  static class Qualified {
    @Override
    public boolean equals(Object o) {
      return Qualified.this.equals(o);
    }
  }

  static class Lambda {
    @Override
    public boolean equals(Object o) {
      Runnable r = () -> this.equals(o);
      return false;
    }
  }

  @SuppressWarnings("EqualsReference")
  static class Suppressed {
    @Override
    public boolean equals(Object o) {
      return this.equals(o);
    }
  }
}
