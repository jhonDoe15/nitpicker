class S38Pmi10 {
  void test(Object o) {
    if (o instanceof S38Pmi10 && o.hashCode() != 1) {
      S38Pmi10 test = (S38Pmi10) o;
      test(test);
    }
  }
}
