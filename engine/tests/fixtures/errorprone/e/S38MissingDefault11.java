class S38MissingDefault11 {
  void f() {}

  void m(int i) {
    switch (i) {
      case 0 -> f();
      case 1 -> f();
      default -> f();
    }
  }
}
