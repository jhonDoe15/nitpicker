class S38Pmi23 {
  public void foo(Object o) {
    if (o instanceof String) {
      while (((String) o).hashCode() != 0) {
        o = o.toString();
      }
    }
  }
}
