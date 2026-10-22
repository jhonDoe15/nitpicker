package app;

class Point {
  private int x;
  private int y;

  int getX() {
    return x;
  }

  void setX(int x) {
    this.x = x;
  }

  public int getY() {
    return y;
  }

  @Override
  public boolean equals(Object other) {
    return other instanceof Point;
  }

  @Override
  public int hashCode() {
    return x;
  }

  @Override
  public String toString() {
    return "p";
  }
}
