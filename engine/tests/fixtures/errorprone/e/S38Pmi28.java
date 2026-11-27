class S38Pmi28<T> {
  private String val;

  public String stringify(Object o) {
    return !(o instanceof S38Pmi28) ? "not a test" : ((S38Pmi28) o).val;
  }
}
