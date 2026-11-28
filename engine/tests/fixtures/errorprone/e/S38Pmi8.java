class S38Pmi8 {
  void test(Object o) {
    if (!(o instanceof S38Pmi8)) {
      test(o);
    }
    S38Pmi8 test = (S38Pmi8) o;
    test(test);
  }
}
