class S38Pmi24 {
  private final int x = 0;
  private final int y = 1;

  @Override
  public boolean equals(Object o) {
    return o instanceof S38Pmi24 && ((S38Pmi24) o).x == this.x && ((S38Pmi24) o).y == this.y;
  }
}
