class S38Pmi27 {
  private String val;

  public String stringify(Object o) {
    return !(o instanceof S38Pmi27) ? "not a test" : ((S38Pmi27) o).val;
  }
}
