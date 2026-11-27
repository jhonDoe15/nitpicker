class S38Pmi15 {
  void test(Object o) {
    if (o instanceof S38Pmi15) {
      test((S38Pmi15) o);
      test(((S38Pmi15) o).hashCode());
    }
  }
}
