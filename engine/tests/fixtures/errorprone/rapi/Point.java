package rapi;

import com.google.errorprone.annotations.RestrictedApi;

public record Point(int x, int y) {
  @RestrictedApi(explanation = "compact", allowlistAnnotations = Allow.class)
  public Point {}

  public Point() {
    this(0, 0);
  }

  static Point made() {
    return new Point(1, 2);
  }
}
