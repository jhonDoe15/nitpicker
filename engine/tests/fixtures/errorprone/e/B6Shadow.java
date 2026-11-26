package e;

import java.util.List;

class B6Shadow<T, U extends Number> {
  <T> void method(T t) {}

  <V> void noClash(V v) {}

  <T, U> void both(T t, U u) {}

  <T2, T> void secondClash(T t) {}

  static <T> void staticMethod(T t) {}

  class Inner<T> {}

  class InnerOk<W> {
    <U> void deep(U u) {}
  }

  static class StaticInner<T> {
    <T> void inStatic() {}
  }

  interface InnerInterface<T> {}

  enum InnerEnum {
    A;

    <T> void f() {}
  }

  record InnerRecord<T>(T t) {}

  <T3> void level1() {
    class Local<T3> {
      <T> void deeper() {}
    }
    new Object() {
      <U> void anon() {}
    };
  }

  /**
   * Doc for it.
   *
   * @param <T> the type
   * @param t value
   */
  <T> void documented(T t, List<T> list) {
    T local = t;
    List<T> other = list;
    Runnable r = () -> {
      T inside = t;
    };
  }

  /**
   * @param <T> first
   * @param <U> second
   */
  <T extends Comparable<T>, U extends T> void bounds(T t, U u) {}

  <T2, T3> void collisions(T2 a) {
    class L<T extends Number & Comparable<T>> {
    }
  }

  <T1, T> void numbered() {}

  class WithNumbers<T1, T> {
    <T1> void m(T1 a) {}
  }

  @SuppressWarnings("TypeParameterShadowing")
  <T> void suppressedMethod() {}

  @SuppressWarnings("TypeParameterShadowing")
  class SuppressedInner<T> {}

  B6Shadow() {}

  <T> B6Shadow(int x) {}

  class Outer2<A> {
    class Mid<B> {
      class Deep<A, B> {}
    }
  }

}
