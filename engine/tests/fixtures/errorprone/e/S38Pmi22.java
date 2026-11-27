class S38Pmi22 {
  void test(Object o) {
    if (o instanceof S38Pmi22) {
      test((S38Pmi22) o);
      S38Pmi22 test = (S38Pmi22) o;
      test(test);
    }
  }
}
