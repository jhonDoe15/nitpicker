package e;

import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;
import java.util.stream.Collectors;

class B5Refs {
  static <T> List<T> filter(List<T> in, Predicate<T> p) {
    return in.stream().filter(p::test).collect(Collectors.toList());
  }

  static <T> boolean test(Predicate<T> p, T value) {
    Predicate<T> same = p::test;
    Runnable r = () -> {};
    Runnable again = r::run;
    Supplier<String> s = () -> "x";
    Supplier<String> t = s::get;
    return same.test(value);
  }

  static boolean other(String s, Predicate<String> p) {
    Predicate<String> q = p::test;
    Supplier<Boolean> e = s::isEmpty;
    Function<String, Integer> f = String::length;
    Supplier<Predicate<String>> fromMethod = p::negate;
    return q.test(s);
  }

  static class Mine implements Predicate<String> {
    public boolean test(String s) {
      return s.isEmpty();
    }

    Predicate<String> self() {
      Predicate<String> p = this::test;
      Predicate<String> q = super::equals;
      return p;
    }
  }

  static Predicate<String> mine(Mine m) {
    return m::test;
  }

  interface Fail<T> {
    void accept(T t);

    static <T> void accept(Fail<T> f, T t) {
      f.accept(t);
    }
  }

  static class Dup {
    void run(Dup d) {}

    static void run(Dup d, int i) {}

    void same(int i) {}

    static void same(Dup d, int i) {}

    private void hidden(int i) {}

    static void hidden(Dup d, int i) {}

    void both(int i) {}

    static void both(Dup d, int i) {}

    @SuppressWarnings("AmbiguousMethodReference")
    void quiet(int i) {}

    static void quiet(Dup d, int i) {}
  }

  enum Mode {
    A;

    void go(String s) {}

    static void go(Mode m, String s) {}
  }

  Object anon() {
    return new Object() {
      void x(int i) {}

      static void x(Object o, int i) {}
    };
  }

  static class Many {
    void m(Many a, String b) {}

    static void m(Many a, Many b, String c) {}
  }
}
