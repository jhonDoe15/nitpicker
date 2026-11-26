package e;

import java.util.concurrent.Callable;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;

public class B4Clash {
  static class A {
    void run(Runnable r) {}

    void run(Callable<String> c) {}

    void other(Supplier<String> s) {}

    void other(Callable<String> c) {}

    void cons(Consumer<String> c) {}

    void cons(Function<String, String> f) {}

    void single(Runnable r) {}

    void single(String s) {}

    void multi(Consumer<String> c, int x) {}

    void multi(Function<String, String> f, int x) {}

    void multi(Function<String, String> f, long x) {}
  }

  static class Ctor {
    Ctor(Runnable r) {}

    Ctor(Callable<String> c) {}

    Ctor(Supplier<String> s) {}
  }

  static class Parent {
    void inherited(Runnable r) {}
  }

  static class Child extends Parent {
    void inherited(Callable<String> c) {}
  }

  static class Overriding extends Parent {
    @Override
    void inherited(Runnable r) {}
  }

  interface I {
    void go(Runnable r);

    void go(Callable<String> c);
  }

  static class Suppressed {
    @SuppressWarnings("FunctionalInterfaceClash")
    void run(Runnable r) {}

    void run(Callable<String> c) {}
  }

  static class Subtype {
    void take(Consumer<String> c) {}

    void take(MyConsumer c) {}
  }

  interface MyConsumer extends Consumer<String> {}

  static class Generic<T> {
    void put(Consumer<T> c) {}

    void put(Callable<T> f) {}
  }
}
