class S38Pmi21 {
  void test(Object o) {
    // No finding here, but also no crash.
    if (o instanceof S38Pmi20(int x, int y)) {}
  }
}
