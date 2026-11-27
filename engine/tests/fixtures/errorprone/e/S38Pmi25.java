class S38Pmi25 {
  private final int x = 0;
  private final int y = 1;

  @Override
  public boolean equals(Object o) {
    if (!(o instanceof S38Pmi25) || ((S38Pmi25) o).x != this.x) {
      return false;
    }
    S38Pmi25 other = (S38Pmi25) o;
    return other.y == this.y;
  }
}
