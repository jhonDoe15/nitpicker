class S38Pmi6 {
  void test(Object o) {
    if (!(o instanceof S38Pmi6) || o.hashCode() == 0) {
      return;
    }
    S38Pmi6 test = (S38Pmi6) o;
    test(test);
  }
}
