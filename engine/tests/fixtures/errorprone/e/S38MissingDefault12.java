class S38MissingDefault12 {
  sealed interface I permits A, B {}

  abstract static class S {}

  static final class A extends S implements I {}

  static final class B extends S implements I {}

  void f(I i) {
    switch (i) {
      case A a -> System.err.println(a);
      case B b -> System.err.println(b);
    }
  }
}
