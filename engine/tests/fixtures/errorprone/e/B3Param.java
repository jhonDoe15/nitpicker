public class B3Param<T> {
  /**
   * Does things.
   *
   * @param foo the foo
   * @param barr the bar
   * @param bazz the unknown baz
   * @param <U> not a type parameter
   * @param <T> a type parameter
   */
  void m(int foo, int bar, String name) {}

  /**
   * Colon after name.
   *
   * @param foo: the foo
   * @param bar : spaced
   */
  void colon(int foo, int bar) {}

  /**
   * Uses {@code nme} and {@code name} and {@code true} and {@code xyz}.
   *
   * @param name the name
   * @return {@code naem} again
   */
  String code(String name) {
    return name;
  }

  /**
   * Type params.
   *
   * @param <S> the s
   * @param <R> the r
   * @param value the value
   */
  <S, Q> void generic(int value) {}

  /**
   * A constructor.
   *
   * @param valu the value
   */
  B3Param(int value) {}

  /**
   * @param name unknown on a field-like class
   * @param <T> ok
   */
  static class Inner {}

  /**
   * @param first the first
   * @param secnd the second
   * @param third gone
   */
  record R(int first, int second) {}

  /**
   * @param ok fine
   */
  @SuppressWarnings("InvalidParam")
  void quiet(int ok, int other) {}

  /**
   * @param
   */
  void bad(int a) {}

  /**
   * @param a
   */
  void noDescription(int a) {}

  /**
   * @param a first
   * @param a again
   */
  void duplicate(int a) {}
}
