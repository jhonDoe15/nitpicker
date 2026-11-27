class S38Pmi5 {
  void test(Object o) {
    if (o instanceof S38Pmi5) {
    } else if (true) {
      throw new AssertionError();
    } else {
      return;
    }
    S38Pmi5 test = (S38Pmi5) o;
    test(test);
  }
}
