class S38Pmi29<T> {
  private String val;

  public Class stringify(Object o) {
    if (o instanceof Class<?>) {
      return (Class) o;
    }
    return null;
  }
}
