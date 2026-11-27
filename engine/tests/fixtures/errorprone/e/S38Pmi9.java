class S38Pmi9 {
  void test(Object o) {
    if (o instanceof S38Pmi9 || o.hashCode() > 0) {
      S38Pmi9 test = (S38Pmi9) o;
      test(test);
    }
  }
}
