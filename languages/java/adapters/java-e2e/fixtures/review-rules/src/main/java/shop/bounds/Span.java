package shop.bounds;

public class Span {
  private final int min;
  private final int max;
  private final String beforePath;
  private final String afterPath;

  public Span(int min, int max, String beforePath, String afterPath) {
    this.min = min;
    this.max = max;
    this.beforePath = beforePath;
    this.afterPath = afterPath;
  }

  public int getMin() {
    return min;
  }

  public int getMax() {
    return max;
  }

  public int min() {
    return min;
  }

  public int max() {
    return max;
  }

  public String getBeforePath() {
    return beforePath;
  }

  public String getAfterPath() {
    return afterPath;
  }

  public int getPreviousIndex() {
    return min - 1;
  }

  public int getNextIndex() {
    return max + 1;
  }

  public int getWidth() {
    return max - min;
  }

  public int getHeight() {
    return max - min;
  }

  public Span getNext(Span range) {
    return range;
  }

  public int x() {
    return min;
  }

  public int y() {
    return max;
  }
}
