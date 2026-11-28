package audit;

import java.lang.annotation.Repeatable;
import java.util.List;

public record Kept(List<String> names, int size) {
  public Kept(java.util.List<String> names, int size) {
    this.names = names;
    this.size = size;
  }

  public boolean equals(Kept other) {
    return other != null && size == other.size;
  }

  public int size(int extra) {
    return size + extra;
  }

  enum Switching {
    A,
    B
  }

  static int pick(Switching value) {
    switch (value) {
      case A:
        return 1;
      default:
        return 2;
    }
  }

  @Repeatable(Tags.class)
  @interface Tag {
    String value();
  }

  @interface Tags {
    Tag[] value();
  }

  @Tag("a")
  @Tag("b")
  static void tagged() {}

  @FunctionalInterface
  interface Task {
    @Deprecated
    void run();
  }
}
