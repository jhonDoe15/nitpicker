package e;

import java.util.stream.IntStream;
import java.util.stream.Stream;

class B7Decls {
  static int counter;
  static B7Decls last;
  int instance;
  static final int[] TABLE = new int[2];

  B7Decls() {
    counter = 1;
    B7Decls.counter = 2;
    this.instance = 3;
    instance = 4;
    last = this;
    last = new B7Decls(1);
    TABLE[0] = 1;
    counter += 2;
    int local;
    local = 5;
    counter = last.instance = 6;
    Runnable r = () -> counter = 7;
    new Object() {
      void m() {
        counter = 8;
      }
    };
  }

  B7Decls(int x) {
    this.instance = x;
  }

  @SuppressWarnings("StaticAssignmentInConstructor")
  B7Decls(String s) {
    counter = 9;
  }

  void notConstructor() {
    counter = 10;
  }

  long casts() {
    long a = (long) 1;
    long b = (long) -1;
    double c = (double) 7;
    float d = (float) 0x10;
    double e = (double) 010;
    double f = (double) 0;
    long g = (long) 0x10;
    long h = (long) (1);
    long i = (long) 1L;
    double j = (double) 1.0;
    int k = (int) 5;
    double l = (double) -0x10;
    double m = (double) - 3;
    Object n = (Object) 5;
    return a + b + (long) c + (long) d + (long) e + (long) f + g + h + i + (long) j + k + (long) l + (long) m + (long) n.hashCode();
  }

  public int stream() {
    return 1;
  }

  public String stream(int x) {
    return "";
  }

  public Stream<String> stream(String x) {
    return Stream.of(x);
  }

  public IntStream stream(long x) {
    return IntStream.of();
  }

  Object stream(char x) {
    return null;
  }

  protected void stream(boolean x) {}

  public int[] stream(byte x) {
    return null;
  }

  public <T> T stream(T x) {
    return x;
  }

  interface Streams {
    int stream();

    Stream<String> stream(int x);

    private void stream(String s) {}
  }

  @SuppressWarnings("PublicApiNamedStreamShouldReturnStream")
  public int stream(short x) {
    return 1;
  }

  static class Point {
    int x;

    @Override
    public boolean equals(Object o) {
      Point p = (Point) o;
      return p.x == x;
    }

    @Override
    public int hashCode() {
      return x;
    }
  }

  static class Point2 {
    int x;

    @Override
    public boolean equals(Object o) {
      if (!(o instanceof Point2)) {
        return false;
      }
      Point2 p = (Point2) o;
      return p.x == x;
    }
  }

  static class Point3 {
    @Override
    public boolean equals(Object o) {
      if (o == null || getClass() != o.getClass()) {
        return false;
      }
      return ((Point3) o).hashCode() == hashCode();
    }
  }

  static class Point4 {
    @Override
    public boolean equals(Object o) {
      return o instanceof CharSequence && ((String) o).isEmpty();
    }
  }

  static class Point5 {
    @Override
    public boolean equals(Object other) {
      return other != null && ((Point5) other) == this;
    }
  }

  static class Point6 {
    @Override
    public boolean equals(Object other) {
      if (other instanceof Point6 q) {
        return q == this;
      }
      Point6 p = (Point6) other;
      Object x = (Object) other;
      return false;
    }
  }

  static class Point7 {
    public boolean equals(Point7 other) {
      Point7 p = (Point7) other;
      return false;
    }
  }

  static class Point8 {
    @Override
    public boolean equals(Object o) {
      return java.util.Objects.equals(o, this) && ((Point8) o).hashCode() == 1;
    }
  }

  static class Point9 {
    @Override
    public boolean equals(Object o) {
      return this == o || (o != null && ((Point9) o).equals(this));
    }
  }
}
