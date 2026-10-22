package a;

public class Outer {
  public static class Inner {
    public static Inner make() {
      return new Inner();
    }

    public int value() {
      return outerOnly();
    }
  }

  private static int outerOnly() {
    return 1;
  }

  public int use() {
    Inner inner = Inner.make();
    return inner.value();
  }

  public static class Weird extends Thread {
    public int ask() {
      return outerOnly() + start2();
    }

    public int start2() {
      return 2;
    }
  }
}
