class S38Pmi13 {
  void test(Object x, Object y) {
    if (x instanceof S38Pmi13) {
      S38Pmi13 test = (S38Pmi13) y;
      test(test, null);
    }
  }
}
