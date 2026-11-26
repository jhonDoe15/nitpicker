package e;

class B7Docs {
  /**
   * Does something.
   *
   * @return nothing
   */
  void a() {}

  /** Does something. {@return the thing} */
  void b() {}

  /**
   * Fine.
   *
   * @param x the x
   */
  void c(int x) {}

  /**
   * Returns.
   *
   * @return a value
   */
  int d() {
    return 1;
  }

  /**
   * Two.
   *
   * @return first
   * @return second
   */
  void e() {}

  /**
   * Empty.
   *
   * @return
   */
  void f() {}

  /**
   * Suppressed.
   *
   * @return nothing
   */
  @SuppressWarnings("ReturnFromVoid")
  void g() {}

  /** @return x */
  void h() {}
}
