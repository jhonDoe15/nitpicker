class S38Pmi1 {
  void test(Object o) {
    if (o instanceof S38Pmi1) {
      S38Pmi1 test = (S38Pmi1) o;
      test(test);
    }
  }
}
