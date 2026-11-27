class S38Pmi12 {
  void test(Object o) {
    if (o.hashCode() > 0) {
      Integer test = (Integer) o;
      test(test);
    }
  }
}
