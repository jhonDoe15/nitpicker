package shapes;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Supplier;

public class Shapes {
  private final List<Runnable> tasks = new ArrayList<>();
  private int count, total;

  static {
    System.setProperty("shapes", "on");
  }

  public void run(Kind kind) {
    assert kind != null;
    tasks.add(() -> count++);
    tasks.add(new Runnable() {
      @Override
      public void run() {
        total++;
      }
    });
    class Local {
      int twice() {
        return count * 2;
      }
    }
    total += new Local().twice();
    switch (kind) {
      case ROUND -> count++;
      case SQUARE -> total++;
      default -> {}
    }
    Supplier<String> named = (Supplier<String> & Serializable) () -> "x";
    total += named.get().length();
  }

  public enum Kind {
    ROUND {
      @Override
      int corners() {
        return 0;
      }
    },
    SQUARE,
    OTHER;

    int corners() {
      return 4;
    }
  }

  enum Size {
    SMALL(1),
    LARGE(2);

    private final int factor;

    Size(int factor) {
      this.factor = factor;
    }

    int factor() {
      return factor;
    }
  }

  public class Inner {
    int read() {
      return count;
    }
  }

  static class ByName implements Comparator<String> {
    @Override
    public int compare(String left, String right) {
      return left.compareTo(right);
    }
  }

  private Shapes() {}

  Shapes(int count) {
    this.count = count;
  }

  interface Area {
    double PI = 3.14;

    double area();

    default double twice() {
      return area() * 2;
    }

    static Area unit() {
      return () -> 1;
    }

    private double half() {
      return area() / 2;
    }
  }

  @interface Tag {
    String value() default "";

    int[] codes() default {};

    int LIMIT = 3;

    enum Level { LOW, HIGH }
  }
}

record Point(int x, int y) {
  Point {
    if (x < 0) {
      throw new IllegalArgumentException();
    }
  }

  Point(int both) {
    this(both, both);
  }

  public int x() {
    return x;
  }

  int y(int scale) {
    return y * scale;
  }

  static Point origin() {
    return new Point(0, 0);
  }
}

record Pair<T>(T left, T right) {
  public Pair(T left, T right) {
    this.left = left;
    this.right = right;
  }

  @Override
  public boolean equals(Object other) {
    return other instanceof Pair<?> pair && left.equals(pair.left);
  }

  @Override
  public int hashCode() {
    return left.hashCode();
  }

  public String toString(int width) {
    return String.valueOf(width);
  }
}

record Values(String name, int... values) {}

class Box<T extends Comparable<T>> implements Comparable<Box<T>> {
  T value;

  @Override
  public int compareTo(Box<T> other) {
    return value.compareTo(other.value);
  }
}
